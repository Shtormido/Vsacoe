/* Drift Restomod — vehicle dynamics (no three.js dependency, testable in Node).
 *
 * Planar rigid body + four independent wheels:
 *   - Pacejka-style tyre curve with combined slip (friction ellipse), load sensitivity,
 *     and relaxation lengths for slip ratio / slip angle (stable down to standstill);
 *   - longitudinal and lateral load transfer with a suspension lag;
 *   - wheel spin dynamics, brakes with optional ABS, handbrake on the rear axle;
 *   - engine torque curve, clutch, gearbox (auto or manual), limited-slip differentials, AWD centre coupling;
 *   - Ackermann steering, aerodynamic drag, rolling resistance.
 * Car frame: x forward, z right, yaw positive turns left (rotation about +Y).
 */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const G = 9.81;
  const RPM = 60 / (2 * Math.PI);

  // per-car data. weightFront = static share on the front axle.
  const SPECS = {
    VAZ2106_Restomod: {
      desc: 'Белая шестёрка на расширителях', mass: 1150, weightFront: 0.52, cgH: 0.48,
      torque: 265, peakRpm: 5200, redline: 7600, idle: 900, gears: [3.3, 2.15, 1.55, 1.2, 1.0, 0.84], final: 4.1,
      drive: 'RWD', mu: 1.05, lock: 52, brakeF: 2200, brakeR: 1300, lsd: 260,
    },
    ZAZ968_Coupe: {
      desc: 'Заднемоторное купе: лёгкий нос, тяжёлая корма', mass: 980, weightFront: 0.41, cgH: 0.46,
      torque: 200, peakRpm: 5000, redline: 7200, idle: 900, gears: [3.4, 2.2, 1.55, 1.18, 0.96], final: 4.3,
      drive: 'RWD', mu: 1.0, lock: 48, brakeF: 1800, brakeR: 1300, lsd: 200,
    },
    LADA2107_NewGen: {
      desc: 'Классика нового поколения, турбо', mass: 1220, weightFront: 0.53, cgH: 0.5,
      torque: 340, peakRpm: 4200, redline: 7000, idle: 850, gears: [3.2, 2.05, 1.5, 1.18, 1.0, 0.82], final: 3.9,
      drive: 'RWD', mu: 1.05, lock: 52, brakeF: 2400, brakeR: 1400, lsd: 280,
    },
    Nova63_Restomod: {
      desc: 'V8, 430 сил и много дыма', mass: 1420, weightFront: 0.55, cgH: 0.52,
      torque: 560, peakRpm: 4200, redline: 6600, idle: 750, gears: [2.95, 1.94, 1.34, 1.0, 0.73], final: 3.55,
      drive: 'RWD', mu: 1.08, lock: 50, brakeF: 2900, brakeR: 1700, lsd: 340,
    },
    VAZ2108_2025: {
      desc: 'Полный привод, 35/65 с упором назад', mass: 1050, weightFront: 0.56, cgH: 0.5,
      torque: 300, peakRpm: 4500, redline: 7200, idle: 900, gears: [3.3, 2.1, 1.5, 1.15, 0.94, 0.78], final: 4.0,
      drive: 'AWD', awdFront: 0.35, mu: 1.05, lock: 46, brakeF: 2200, brakeR: 1300, lsd: 240,
    },
    ZIL111_Restomod: {
      desc: 'Две с лишним тонны и большой V8', mass: 2250, weightFront: 0.52, cgH: 0.58,
      torque: 640, peakRpm: 3200, redline: 5400, idle: 650, gears: [2.6, 1.6, 1.12, 0.85], final: 3.7,
      drive: 'RWD', mu: 1.08, lock: 46, brakeF: 3600, brakeR: 2200, lsd: 420,
    },
  };

  // normalised tyre curve: 0 -> peak 1 at n=1 -> ~0.85 when sliding
  const MF_B = 2.33, MF_C = 1.35;
  const tyreCurve = (n) => Math.sin(MF_C * Math.atan(MF_B * n));

  class Vehicle {
    /* geo: {wheels: [[x, y, z] x4] (car frame, metres), R, length, width} */
    constructor(geo, spec) {
      this.spec = spec;
      const fx = Math.max(...geo.wheels.map((w) => w[0])), rx = Math.min(...geo.wheels.map((w) => w[0]));
      this.L = fx - rx;
      this.b = spec.weightFront * this.L;            // CG to rear axle
      this.a = this.L - this.b;                       // CG to front axle
      this.cgx = rx + this.b;                         // CG position in the model frame
      this.R = geo.R;
      this.len = geo.length; this.wid = geo.width;
      this.m = spec.mass;
      this.Iz = this.m * (this.a * this.a + this.b * this.b) * 0.55 + this.m * (geo.width * geo.width) * 0.05;
      this.h = spec.cgH;
      // wheels: FL, RL, FR, RR as in the model; store car-frame offsets relative to CG
      this.w = geo.wheels.map((p) => ({
        px: p[0] - this.cgx, pz: p[2], front: p[0] > 0.5 * (fx + rx), left: p[2] < 0,
        omega: 0, kappa: 0, alpha: 0, Fz: 0, Fx: 0, Fy: 0, delta: 0, slip: 0, angle: 0, locked: false,
      }));
      this.tf = Math.abs(this.w.find((w) => w.front && w.left).pz - this.w.find((w) => w.front && !w.left).pz);
      this.tr = Math.abs(this.w.find((w) => !w.front && w.left).pz - this.w.find((w) => !w.front && !w.left).pz);
      this.Iw = 1.4;
      this.reset(0, 0, 0);
    }

    reset(x, z, yaw) {
      this.x = x; this.z = z; this.yaw = yaw;
      this.vx = 0; this.vz = 0; this.r = 0;
      this.axL = 0; this.ayL = 0;                       // filtered car-frame accelerations (load transfer)
      this.steer = 0; this.gear = 1; this.rpm = this.spec.idle; this.shiftT = 0;
      this.clutch = 1; this.reverseHold = 0;
      for (const w of this.w) { w.omega = 0; w.kappa = 0; w.alpha = 0; w.angle = 0; }
    }

    get speed() { return Math.hypot(this.vx, this.vz); }
    fwd() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }
    right() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
    local() {
      const [fx, fz] = this.fwd(), [rx, rz] = this.right();
      return [this.vx * fx + this.vz * fz, this.vx * rx + this.vz * rz];
    }

    engineTorque(rpm) {
      const s = this.spec;
      if (rpm <= s.peakRpm) { const x = clamp(rpm / s.peakRpm, 0, 1); return s.torque * (0.5 + 0.5 * (1 - (1 - x) * (1 - x))); }
      const y = clamp((rpm - s.peakRpm) / (s.redline - s.peakRpm), 0, 1.2);
      return s.torque * (1 - 0.32 * y * y);
    }

    ratio() {
      const s = this.spec;
      if (this.gear === 0) return 0;
      if (this.gear < 0) return -s.gears[0] * 1.05 * s.final;
      return s.gears[this.gear - 1] * s.final;
    }

    shift(d) {
      const n = this.spec.gears.length;
      const g = clamp(this.gear + d, -1, n);
      if (g !== this.gear) { this.gear = g; this.shiftT = 0.18; }
    }

    /* inp: {steer -1..1 (left +), throttle 0..1, brake 0..1, handbrake bool}
       opt: {auto, abs, steerHelp, driftHelp, tcs: bool; surface(x, z) -> grip multiplier} */
    step(dt, inp, opt) {
      const s = this.spec, m = this.m;
      const [fx, fz] = this.fwd(), [rx, rz] = this.right();
      const u = this.vx * fx + this.vz * fz, v = this.vx * rx + this.vz * rz;
      const spd = Math.hypot(u, v);

      // ---- gearbox (automatic: reverse by holding brake at a stop) and driver inputs
      let throttle = inp.throttle, brake = inp.brake;
      if (opt.auto) {
        if (this.gear > 0 && brake > 0.3 && spd < 0.8 && throttle === 0) {
          this.reverseHold += dt;
          if (this.reverseHold > 0.35) { this.gear = -1; this.reverseHold = 0; }
        } else if (this.gear < 0 && throttle > 0.3 && spd < 0.8) { this.gear = 1; }
        else this.reverseHold = 0;
        if (this.gear < 0) { const t = throttle; throttle = brake; brake = t; }
        // shift on road speed (not on spinning wheels) with a hold time to avoid hunting
        const groundRpm = Math.abs(u) / this.R * (this.gear > 0 ? s.gears[this.gear - 1] * s.final : 0) * RPM;
        this.shiftHold = Math.max(0, (this.shiftHold || 0) - dt);
        if (this.gear > 0 && this.shiftHold <= 0) {
          const n = s.gears.length;
          if (this.gear < n && throttle > 0.2 && (groundRpm > s.redline * 0.93 || (this.rpm > s.redline * 0.99 && groundRpm > s.redline * 0.7))) {
            this.shift(1); this.shiftHold = 0.8;
          } else if (this.gear > 1) {
            const down = groundRpm * s.gears[this.gear - 2] / s.gears[this.gear - 1];
            if (down < s.redline * 0.8 && (groundRpm < s.peakRpm * 0.55 || (brake > 0.2 && down < s.redline * 0.7))) {
              this.shift(-1); this.shiftHold = 0.5;
            }
          }
        }
      }
      if (this.shiftT > 0) this.shiftT -= dt;

      // ---- steering: driver lock, optional helper that keeps the front tyres near peak slip
      const lock = s.lock * Math.PI / 180;
      let target = inp.steer * lock;
      const frontVel = Math.atan2(-(v - this.r * this.a), Math.max(Math.abs(u), 0.5)) * (u >= -0.5 ? 1 : -1);
      if (opt.steerHelp && spd > 3) {
        const lim = 0.16 + (s.mu * G * this.L) / Math.max(spd * spd, 1);       // ~ path curvature limit + peak slip
        const centre = inp.steer === 0 ? frontVel * 0.92 : frontVel * 0.6;     // self-aligning towards the travel
        target = clamp(target + (inp.steer === 0 ? centre : 0), centre - lim, centre + lim);
        target = clamp(target, -lock, lock);
      }
      const beta = Math.atan2(-v, Math.max(Math.abs(u), 1)) * (u >= 0 ? 1 : -1);
      const rate = 2.6 + (inp.steer === 0 ? 2.5 : 0);
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
      const t = Math.tan(this.steer);
      const ack = 0.6;
      for (const w of this.w) {
        if (!w.front) { w.delta = 0; continue; }
        const half = (w.left ? -1 : 1) * this.tf / 2;          // z of this wheel (right +)
        const full = Math.atan(this.L * t / (this.L + half * t));
        w.delta = this.steer + (full - this.steer) * ack;
      }

      // ---- vertical loads: static + filtered longitudinal / lateral transfer
      const Wf = m * G * this.b / this.L, Wr = m * G * this.a / this.L;
      const dLong = m * this.axL * this.h / this.L;
      const latF = 0.56;
      const dLatF = m * this.ayL * this.h / this.tf * latF, dLatR = m * this.ayL * this.h / this.tr * (1 - latF);
      for (const w of this.w) {
        let Fz = (w.front ? Wf : Wr) / 2 + (w.front ? -dLong : dLong) / 2;
        Fz += (w.left ? 1 : -1) * (w.front ? dLatF : dLatR);   // + ay (rightward accel) loads the left side
        w.Fz = Math.max(Fz, 0);
      }

      // ---- drivetrain torque
      const ratio = this.ratio();
      const driven = this.w.filter((w) => s.drive === 'AWD' || !w.front);
      const wheelRpm = driven.reduce((acc, w) => acc + w.omega, 0) / driven.length * ratio * RPM;
      let Tdrive = 0;
      const shifting = this.shiftT > 0;
      if (this.gear === 0 || ratio === 0) {
        this.rpm += ((throttle * 7000 + s.idle * 0.6) - this.rpm) * Math.min(1, 6 * dt);
      } else {
        const clutchRpm = s.idle + 500;
        if (wheelRpm < clutchRpm) {                // clutch slipping (launch / crawling)
          const launch = s.idle + throttle * (s.peakRpm * 0.85 - s.idle);
          this.rpm += (Math.max(launch, wheelRpm) - this.rpm) * Math.min(1, 8 * dt);
          const creep = brake > 0 || inp.handbrake ? 0 : 0.06;
          Tdrive = this.engineTorque(this.rpm) * Math.max(throttle, creep) * ratio * 0.92;
        } else {
          this.rpm = wheelRpm;
          const cut = this.rpm > s.redline;
          const eb = s.torque * 0.18 * clamp(this.rpm / s.redline, 0.2, 1);   // engine braking
          const te = cut ? -eb : throttle * this.engineTorque(this.rpm) - (1 - throttle) * eb;
          Tdrive = te * ratio * 0.92;
        }
        if (shifting) Tdrive *= 0.1;
      }
      if (opt.tcs && Tdrive > 0) {
        const worst = Math.max(...driven.map((w) => w.kappa));
        if (worst > 0.12) Tdrive *= clamp(1 - (worst - 0.12) * 6, 0.15, 1);
      }
      this.rpm = clamp(this.rpm, s.idle * 0.8, s.redline * 1.04);
      // split: centre (AWD) and limited-slip axle differentials (viscous-style coupling)
      const axleT = { front: 0, rear: 0 };
      if (s.drive === 'AWD') {
        const fr = s.awdFront || 0.35;
        const of = (this.w[0].omega + this.w[2].omega) / 2, or = (this.w[1].omega + this.w[3].omega) / 2;
        const couple = clamp(150 * (or - of), -Math.abs(Tdrive) * 0.5 - 200, Math.abs(Tdrive) * 0.5 + 200);
        axleT.front = Tdrive * fr + couple; axleT.rear = Tdrive * (1 - fr) - couple;
      } else axleT.rear = Tdrive;
      const wheelT = [0, 0, 0, 0];
      const axle = (li, ri, T) => {
        const L = this.w[li], Rw = this.w[ri];
        const lim = Math.abs(T) * 0.7 + 120;
        const lockT = clamp(s.lsd * (Rw.omega - L.omega), -lim, lim);
        wheelT[li] += T / 2 + lockT; wheelT[ri] += T / 2 - lockT;
      };
      axle(0, 2, axleT.front);     // FL, FR
      axle(1, 3, axleT.rear);      // RL, RR

      // ---- tyres: slip angle with relaxation length, slip ratio solved implicitly with the wheel spin
      let Fx = 0, Fz = 0, Mz = 0;
      const sy = 0.4;                       // lateral relaxation length (m)
      const kPeak = 0.11, aPeak = 0.13;     // peak slip ratio / slip angle (tan)
      const Fz0 = m * G / 4;
      const tyre = (kap, alp, mu, load) => {
        const nx = kap / kPeak, ny = alp / aPeak, n = Math.hypot(nx, ny);
        if (n < 1e-7) return [0, 0, 0];
        const F = mu * load * tyreCurve(n);
        return [F * nx / n, -F * ny / n, n];
      };
      for (let i = 0; i < 4; i++) {
        const w = this.w[i];
        const pu = u + this.r * w.pz, pv = v - this.r * w.px;
        const cd = Math.cos(w.delta), sd = Math.sin(w.delta);
        const vl = pu * cd - pv * sd;           // along the wheel
        const vt = pu * sd + pv * cd;           // to the wheel's right
        const av = Math.abs(vl);
        w.alpha += (vt - (av + 1.0) * w.alpha) / sy * dt;
        w.alpha = clamp(w.alpha, -4, 4);
        const den = Math.max(av, 2.0);
        const load = w.Fz;
        let mu = s.mu * clamp(1 - 0.1 * (load / Fz0 - 1), 0.75, 1.12);
        if (opt.surface) {
          const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
          mu *= opt.surface(this.x + c * w.px + sn * w.pz, this.z - sn * w.px + c * w.pz);
        }
        const kap = (w.omega * this.R - vl) / den;
        const [fx0] = tyre(kap, w.alpha, mu, load);
        const [fx1] = tyre(kap + 0.002, w.alpha, mu, load);
        const dFdOm = Math.max(0, (fx1 - fx0) / 0.002) * this.R / den;
        // implicit wheel spin update: Iw * dw = (T - R*Fx(w_new) - rolling) dt
        const roll = Math.sign(w.omega) * 0.012 * load * this.R;
        let om = w.omega + dt * (wheelT[i] - this.R * fx0 - roll) / (this.Iw + dt * this.R * dFdOm);
        let Tb = brake * (w.front ? s.brakeF : s.brakeR);
        if (opt.abs && brake > 0 && spd > 2.5 && kap < -0.14) Tb *= 0.3;
        if (inp.handbrake && !w.front) Tb += 4200;
        const dOm = Tb * dt / (this.Iw + dt * this.R * dFdOm);
        if (Math.abs(om) <= dOm) om = 0; else om -= Math.sign(om) * dOm;
        w.omega = om;
        w.kappa = (om * this.R - vl) / den;
        const [fx, fy, n] = tyre(w.kappa, w.alpha, mu, load);
        w.Fx = fx; w.Fy = fy; w.slip = n;
        w.locked = Tb > 0 && om === 0 && spd > 1;
        w.angle -= om * dt;
        // force into the car frame
        const cfx = fx * cd + fy * sd, cfz = -fx * sd + fy * cd;
        Fx += cfx; Fz += cfz;
        Mz += w.pz * cfx - w.px * cfz;
      }
      // drift help: yaw damping once the slide passes ~45 degrees (keeps a spin catchable)
      if (opt.driftHelp) Mz -= clamp((Math.abs(beta) - 0.75) / 0.5, 0, 1) * this.r * this.Iz * 3.0;
      // aero drag (Cd*A ~ 0.75 m^2) and a little downforce-free lift neglect
      const drag = 0.5 * 1.2 * 0.72;
      Fx -= drag * u * spd; Fz -= drag * v * spd;

      // ---- integrate body
      const axl = Fx / m, ayl = Fz / m;
      this.axL += (axl - this.axL) * Math.min(1, dt / 0.07);
      this.ayL += (ayl - this.ayL) * Math.min(1, dt / 0.07);
      this.vx += (axl * fx + ayl * rx) * dt;
      this.vz += (axl * fz + ayl * rz) * dt;
      this.r += Mz / this.Iz * dt;
      this.yaw += this.r * dt;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      return { u, v, beta };
    }

    // collision response: contact at world offset (px, pz) from the CG with normal n (pointing out of the obstacle)
    impulse(px, pz, nx, nz, e) {
      const vpx = this.vx + this.r * pz, vpz = this.vz - this.r * px;
      const vn = vpx * nx + vpz * nz;
      if (vn >= 0) return 0;
      const pxn = pz * nx - px * nz;
      const j = -(1 + e) * vn / (1 / this.m + pxn * pxn / this.Iz);
      this.vx += j * nx / this.m; this.vz += j * nz / this.m;
      this.r += pxn * j / this.Iz;
      // friction along the wall
      const tx = -nz, tz = nx;
      const vt = (this.vx + this.r * pz) * tx + (this.vz - this.r * px) * tz;
      const jt = clamp(-vt * this.m * 0.3, -0.4 * j, 0.4 * j);
      this.vx += jt * tx / this.m; this.vz += jt * tz / this.m;
      return -vn;
    }
  }

  root.DriftPhysics = { Vehicle, SPECS, tyreCurve };
})(typeof window !== 'undefined' ? window : globalThis);
