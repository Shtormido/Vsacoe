import { html, S, api, call, toast, patchCfg } from '../lib.js';
import { Icon } from '../icons.js';
import { Setting, Toggle, InfoBar } from '../ui.js';

export function AppPage() {
  const c = S.cfg;
  const a = c.app;
  const info = S.info;
  const set = (k, v) => patchCfg({ app: { ...a, [k]: v } });
  return html`<div class="page">
    <h1 class="page-title">Параметры</h1>
    <p class="page-sub">Поведение программы. Все данные хранятся рядом с exe — программу можно переносить на флешке.</p>
    ${!info.admin && html`<div style="margin-bottom:12px"><${InfoBar} type="err" title="Нет прав администратора." action=${html`<button class="btn sm primary" onClick=${() => api.call('app:relaunchAdmin')}>Перезапустить</button>`}>winws.exe и сервис требуют запуска от имени администратора.<//></div>`}
    ${info.sim && html`<div style="margin-bottom:12px"><${InfoBar} type="warn" title="Режим симуляции.">Программа запущена не в Windows: winws и сервис имитируются, системные проверки недоступны.<//></div>`}

    <div class="section-title">Окно и трей</div>
    <${Setting} icon="menu" title="Сворачивать в трей при закрытии" desc="Значок в трее меняет цвет вместе с состоянием"><${Toggle} on=${a.minimizeToTray} onChange=${v => set('minimizeToTray', v)} /><//>
    <${Setting} icon="eye" title="Запускать свёрнутым"><${Toggle} on=${a.startMinimized} onChange=${v => set('startMinimized', v)} /><//>
    <${Setting} icon="rocket" title="Запуск вместе с Windows" desc="Через планировщик задач с правами администратора (без запроса UAC)">
      <${Toggle} on=${a.autoStart} onChange=${async v => { try { await call('app:autostart', v); set('autoStart', v); toast(v ? 'Автозапуск включён' : 'Автозапуск выключен', 'ok', 1800); } catch {} }} /><//>
    <${Setting} icon="play" title="При автозапуске включать обход" desc="Запускает выбранную стратегию, если сервис не установлен"><${Toggle} on=${a.autoStartBat} onChange=${v => set('autoStartBat', v)} /><//>

    <div class="section-title">Обход</div>
    <${Setting} icon="refresh" title="Перезапускать при изменении настроек" desc="Смена профиля или настроек сразу применяется к работающему обходу"><${Toggle} on=${a.autoRestart} onChange=${v => set('autoRestart', v)} /><//>
    <${Setting} icon="stop" title="Полная остановка (как пункт 2 в service.bat)" desc="«Остановить» завершает winws.exe и выгружает драйвер WinDivert. Установленный сервис не удаляется — для этого кнопка «Удалить сервис»"><${Toggle} on=${a.stopFull !== false} onChange=${v => set('stopFull', v)} /><//>
    <${Setting} icon="stop" title="Останавливать обход при выходе" desc="Иначе winws продолжит работать после закрытия программы, как обычный батник"><${Toggle} on=${a.stopOnExit} onChange=${v => set('stopOnExit', v)} /><//>
    <${Setting} icon="pulse" title="Интервал обновления состояния">
      <select class="input" style="width:140px" value=${a.pollMs} onChange=${e => set('pollMs', +e.target.value)}>${[1000, 2000, 3000, 5000, 10000].map(v => html`<option value=${v}>${v / 1000} с</option>`)}</select>
    <//>

    <div class="section-title">Данные</div>
    <${Setting} icon="folder" title="Папка данных" desc=${info.dataDir}>
      <button class="btn" onClick=${() => api.call('shell:open', info.dataDir)}>Открыть</button>
    <//>
    <${Setting} icon="shield" title="Права администратора" desc=${info.admin ? 'Есть' : 'Нет'}>
      ${!info.admin && html`<button class="btn primary" onClick=${() => api.call('app:relaunchAdmin')}>Перезапустить от администратора</button>`}
    <//>

    <div class="section-title">О программе</div>
    <div class="card"><div class="row" style="gap:16px">
      <div class="logo-big" style="width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 40%,#ff3cac));color:var(--accent-text)"><${Icon} name="bolt" size=${28} stroke=${2} /></div>
      <div class="grow"><div style="font-weight:600;font-size:calc(var(--fs)*1.2)">Zapret Ultimate Edition</div>
        <div class="small muted">Версия ${info.version} · оболочка для <a class="dim" style="cursor:default;text-decoration:underline" onClick=${() => api.call('shell:url', 'https://github.com/Flowseal/zapret-discord-youtube')}>zapret-discord-youtube</a> (Flowseal) и <a class="dim" style="cursor:default;text-decoration:underline" onClick=${() => api.call('shell:url', 'https://github.com/bol-van/zapret')}>zapret</a> (bol-van)</div></div>
    </div></div>
  </div>`;
}
