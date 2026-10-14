// Помещения, которые можно купить под салон. В каждом две комнаты:
// груминг-зал (слева) и ресепшен с зоной ожидания (справа). tables — число рабочих столов.

export const SALONS = {
  garage: {
    name: '«Хвостик» в гараже',
    district: 'Окраина · ГСК «Рассвет», бокс 17',
    price: 9000, rent: 250, capacity: 3, tables: 2, prestige: 0.9, tier: 1,
    desc: 'Бетонный пол, кирпичные стены и лампочки на проводах. Зато дёшево — и соседи-автомобилисты обожают собак.',
    size: { w: 7.8, d: 5.6, h: 2.8 },
    floor: 'concrete', wall: 'brick', wallColor: '#c98f72', wallColor2: '#9fb6c4',
    accent: '#ff9248', fabric: '#6f8fae', wood: '#b98a5e', lamp: '#ffd9a8', sky: '#ffcf9e',
  },
  studio: {
    name: 'Студия «Лапки»',
    district: 'Спальный район · ул. Садовая, 12',
    price: 40000, rent: 800, capacity: 5, tables: 3, prestige: 1.2, tier: 2,
    desc: 'Светлая студия на первом этаже: большие окна, тёплый паркет и поток соседей с собаками.',
    size: { w: 9.8, d: 6.6, h: 3 },
    floor: 'wood', wall: 'paint', wallColor: '#f6ebe1', wallColor2: '#bfe3d8',
    accent: '#ff8fa3', fabric: '#7fb7a8', wood: '#c99a6b', lamp: '#fff1d6', sky: '#bfe4ff',
  },
  boutique: {
    name: 'Бутик «Grand Pet»',
    district: 'Центр · Набережная, 1',
    price: 140000, rent: 2200, capacity: 7, tables: 4, prestige: 1.65, tier: 3,
    desc: 'Мрамор, бархат и витрина на набережную. Здесь стригут собак звёзд — и, возможно, будущих чемпионов.',
    size: { w: 11.8, d: 7.6, h: 3.4 },
    floor: 'marble', wall: 'panel', wallColor: '#efe9f6', wallColor2: '#352d4a',
    accent: '#9b7fe6', fabric: '#4b3f72', wood: '#5a3f33', lamp: '#ffe7c4', sky: '#ffd6e8',
  },
};

export const SALON_ORDER = ['garage', 'studio', 'boutique'];
