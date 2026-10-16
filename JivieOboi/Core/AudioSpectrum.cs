using System;
using System.Windows.Threading;
using NAudio.Dsp;
using NAudio.Wave;

namespace JivieOboi;

/// <summary>
/// Спектр того, что сейчас играет в системе (WASAPI loopback). Формат как в Wallpaper Engine:
/// 128 значений — 64 полосы левого канала и 64 правого, от низких частот к высоким, примерно 0…1.
/// </summary>
internal sealed class AudioSpectrum
{
    public static AudioSpectrum Instance { get; } = new();

    const int FftSize = 2048;
    const int FftPow = 11;
    const int Bands = 64;

    readonly object sync = new();
    readonly float[][] ring = { new float[FftSize], new float[FftSize] };
    readonly float[] window = new float[FftSize];
    readonly Complex[] fft = new Complex[FftSize];
    readonly DispatcherTimer timer;
    int ringPos, sampleRate = 48000, failures;
    WasapiLoopbackCapture? capture;
    bool wanted;
    DateTime lastData;

    /// <summary>128 значений (L 0..63, R 64..127).</summary>
    public float[] Values { get; } = new float[Bands * 2];
    /// <summary>Сила басов 0…1 — для встроенных анимаций.</summary>
    public float Bass { get; private set; }
    public bool IsRunning => capture != null;

    public event Action<float[]>? Updated;

    AudioSpectrum()
    {
        for (int i = 0; i < FftSize; i++)
            window[i] = (float)FastFourierTransform.HannWindow(i, FftSize);
        timer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(33) };
        timer.Tick += (_, _) => Compute();
    }

    public void SetActive(bool active)
    {
        if (active == wanted) return;
        wanted = active;
        if (active) StartCapture();
        else StopCapture();
    }

    void StartCapture()
    {
        if (capture != null || failures > 5) return;
        try
        {
            var c = new WasapiLoopbackCapture();
            sampleRate = c.WaveFormat.SampleRate;
            c.DataAvailable += OnData;
            c.RecordingStopped += (_, e) =>
            {
                if (e.Exception != null) Log.Error("Захват звука", e.Exception);
                // Сменилось устройство вывода (наушники/колонки) — перезапускаемся.
                System.Windows.Application.Current?.Dispatcher.BeginInvoke(async () =>
                {
                    if (capture != c) return; // это старый захват, его уже заменили
                    DisposeCapture();
                    await System.Threading.Tasks.Task.Delay(2000);
                    if (wanted) StartCapture();
                });
            };
            c.StartRecording();
            capture = c;
            timer.Start();
        }
        catch (Exception ex)
        {
            failures++;
            Log.Error("Запуск захвата звука", ex);
            DisposeCapture();
        }
    }

    void StopCapture()
    {
        timer.Stop();
        try { capture?.StopRecording(); }
        catch (Exception ex) { Log.Error("Остановка захвата звука", ex); }
        DisposeCapture();
        Array.Clear(Values);
        Bass = 0;
    }

    void DisposeCapture()
    {
        var c = capture;
        capture = null;
        try { c?.Dispose(); }
        catch { /* уже закрыт */ }
    }

    void OnData(object? sender, WaveInEventArgs e)
    {
        var format = (sender as WasapiLoopbackCapture)?.WaveFormat;
        // Общий формат микшера Windows — 32-битный float (IeeeFloat или Extensible с float внутри).
        if (format == null || format.BitsPerSample != 32 ||
            format.Encoding is not (WaveFormatEncoding.IeeeFloat or WaveFormatEncoding.Extensible)) return;
        int channels = format.Channels;
        int frames = e.BytesRecorded / (4 * channels);
        lock (sync)
        {
            for (int f = 0; f < frames; f++)
            {
                int offset = f * channels * 4;
                float l = BitConverter.ToSingle(e.Buffer, offset);
                float r = channels > 1 ? BitConverter.ToSingle(e.Buffer, offset + 4) : l;
                ring[0][ringPos] = l;
                ring[1][ringPos] = r;
                ringPos = (ringPos + 1) % FftSize;
            }
            if (frames > 0) lastData = DateTime.UtcNow;
        }
    }

    void Compute()
    {
        bool silent = (DateTime.UtcNow - lastData).TotalMilliseconds > 300;
        for (int ch = 0; ch < 2; ch++)
        {
            if (!silent)
            {
                lock (sync)
                {
                    for (int i = 0; i < FftSize; i++)
                    {
                        fft[i].X = ring[ch][(ringPos + i) % FftSize] * window[i];
                        fft[i].Y = 0;
                    }
                }
                FastFourierTransform.FFT(true, FftPow, fft);
            }

            for (int b = 0; b < Bands; b++)
            {
                float target = 0;
                if (!silent)
                {
                    // Логарифмическая шкала 30 Гц … 16 кГц.
                    double f0 = 30 * Math.Pow(16000.0 / 30, b / (double)Bands);
                    double f1 = 30 * Math.Pow(16000.0 / 30, (b + 1) / (double)Bands);
                    int i0 = Math.Clamp((int)(f0 * FftSize / sampleRate), 1, FftSize / 2 - 1);
                    int i1 = Math.Clamp((int)(f1 * FftSize / sampleRate), i0 + 1, FftSize / 2);
                    double peak = 0;
                    for (int i = i0; i < i1; i++)
                        peak = Math.Max(peak, Math.Sqrt(fft[i].X * fft[i].X + fft[i].Y * fft[i].Y));
                    // Высокие частоты тише — немного поднимаем их.
                    double boost = 1 + b / (double)Bands * 3;
                    target = (float)Math.Clamp(Math.Log10(1 + peak * boost * 60) / 1.6, 0, 1.2);
                }
                int idx = ch * Bands + b;
                Values[idx] = target > Values[idx] ? target : Values[idx] * 0.82f;
            }
        }

        float bass = 0;
        for (int b = 0; b < 6; b++) bass += (Values[b] + Values[Bands + b]) / 2;
        Bass = Math.Clamp(bass / 6, 0, 1);
        Updated?.Invoke(Values);
    }
}
