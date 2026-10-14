// Глобальные настройки качества (меняются в «Настройках» и параметрами URL).
export const config = {
  shells: 26, // слоёв меха: больше — пышнее, но тяжелее для видеокарты
  shadows: true,
};

export function applyQuality(q) {
  config.shells = q === 'low' ? 12 : q === 'medium' ? 18 : 26;
  config.shadows = q !== 'low';
}
