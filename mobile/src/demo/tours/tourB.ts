import type { DemoTarget, DemoTour } from './types';

const radii = {
  discoveryMeters: 180,
  approachMeters: 95,
  arrivalMeters: 30,
};

export const tourBTargets: DemoTarget[] = [
  {
    id: 'trinity-church',
    sequence: 1,
    name: 'Trinity Church',
    aliases: ['Trinity Church Wall Street'],
    coordinates: { latitude: 40.708064, longitude: -74.012981 },
    targetType: 'building',
    categoryTags: ['history', 'architecture', 'religion'],
    triggerRadii: radii,
    narratives: {
      dana: {
        en: {
          title: 'Trinity Church',
          approachText: 'Trinity Church is just ahead, tucked into one of New York’s busiest crossroads.',
          arrivalText: 'Trinity Church has watched the Financial District change around it for centuries. In this small churchyard, early New York still feels close to the glass towers and market noise around it.',
          estimatedDurationSec: 18,
        },
        ru: {
          title: 'Trinity Church',
          approachText: 'Впереди Trinity Church — тихая точка внутри шумного центра города.',
          arrivalText: 'Trinity Church веками наблюдала, как вокруг менялся Финансовый район. В ее небольшом дворе старый Нью-Йорк все еще ощущается рядом со стеклянными башнями и шумом улиц.',
          estimatedDurationSec: 18,
        },
      },
      arthur: {
        en: {
          title: 'Trinity Church',
          approachText: 'Ahead is Trinity Church, a Gothic Revival anchor in Lower Manhattan.',
          arrivalText: 'Trinity Church is a useful architectural counterpoint to the district around it: vertical, ceremonial, and deliberately set apart from the commercial grid pressing in on every side.',
          estimatedDurationSec: 18,
        },
        ru: {
          title: 'Trinity Church',
          approachText: 'Впереди Trinity Church — неоготический ориентир Нижнего Манхэттена.',
          arrivalText: 'Trinity Church важна как архитектурный контрапункт району вокруг: вертикальная, церемониальная и намеренно отличная от коммерческой сетки улиц.',
          estimatedDurationSec: 18,
        },
      },
    },
    facts: [
      {
        text: 'The current Trinity Church building was consecrated in 1846.',
        sourceReference: 'Trinity Church Wall Street historical timeline',
        verifiedAt: '2026-07-14',
      },
    ],
    media: {
      imageAsset: 'trinity-church-demo',
      attribution: 'AI-generated local demo image, 2026-07-20',
      license: 'Project demo asset',
      altText: { en: 'Trinity Church in Lower Manhattan', ru: 'Trinity Church в Нижнем Манхэттене' },
    },
    route: {
      nextTargetId: 'one-world-trade-center',
      routeCoordinates: [
        { latitude: 40.708064, longitude: -74.012981 },
        { latitude: 40.7092, longitude: -74.0139 },
        { latitude: 40.7106, longitude: -74.0149 },
        { latitude: 40.712743, longitude: -74.013379 },
      ],
      estimatedWalkSeconds: 360,
    },
    presentation: {
      mapCenter: { latitude: 40.708064, longitude: -74.012981 },
      mediaMode: 'photo',
    },
  },
  {
    id: 'one-world-trade-center',
    sequence: 2,
    name: 'One World Trade Center',
    coordinates: { latitude: 40.712743, longitude: -74.013379 },
    targetType: 'building',
    categoryTags: ['architecture', 'skyline', 'rebuilding'],
    triggerRadii: radii,
    narratives: {
      dana: {
        en: {
          title: 'One World Trade Center',
          approachText: 'The tower ahead is One World Trade Center, now the dominant vertical marker of Lower Manhattan.',
          arrivalText: 'One World Trade Center is both a skyscraper and a symbol of rebuilding. Its height changes the skyline, but its meaning comes from the ground around it.',
          estimatedDurationSec: 20,
        },
        ru: {
          title: 'One World Trade Center',
          approachText: 'Впереди One World Trade Center — главный вертикальный ориентир Нижнего Манхэттена.',
          arrivalText: 'One World Trade Center — это и небоскреб, и символ восстановления. Он меняет линию горизонта, но его смысл начинается у земли вокруг него.',
          estimatedDurationSec: 20,
        },
      },
      arthur: {
        en: {
          title: 'One World Trade Center',
          approachText: 'Ahead, One World Trade Center gives the district its contemporary vertical axis.',
          arrivalText: 'The tower’s geometry is intentionally restrained: a monumental form that avoids spectacle at street level while still asserting a new civic skyline.',
          estimatedDurationSec: 20,
        },
        ru: {
          title: 'One World Trade Center',
          approachText: 'Впереди One World Trade Center задает району современную вертикальную ось.',
          arrivalText: 'Геометрия башни намеренно сдержанна: монументальная форма без лишнего спектакля на уровне улицы, но с новой гражданской линией горизонта.',
          estimatedDurationSec: 20,
        },
      },
    },
    facts: [
      {
        text: 'One World Trade Center opened in 2014.',
        sourceReference: 'Port Authority of New York and New Jersey project materials',
        verifiedAt: '2026-07-14',
      },
    ],
    media: {
      attribution: 'No local demo image available; fallback card is intentional',
      license: 'Not applicable',
      altText: { en: 'One World Trade Center tower', ru: 'Башня One World Trade Center' },
    },
    route: {
      nextTargetId: '911-memorial',
      routeCoordinates: [
        { latitude: 40.712743, longitude: -74.013379 },
        { latitude: 40.7119, longitude: -74.0133 },
        { latitude: 40.71149, longitude: -74.013371 },
      ],
      estimatedWalkSeconds: 140,
    },
    presentation: {
      mapCenter: { latitude: 40.712743, longitude: -74.013379 },
      mediaMode: 'photo',
    },
  },
  {
    id: '911-memorial',
    sequence: 3,
    name: '9/11 Memorial',
    coordinates: { latitude: 40.71149, longitude: -74.013371 },
    targetType: 'monument',
    categoryTags: ['memorial', 'civic_space', 'history'],
    triggerRadii: radii,
    narratives: {
      dana: {
        en: {
          title: '9/11 Memorial',
          approachText: 'You are nearing the 9/11 Memorial, where the city slows down around absence and reflection.',
          arrivalText: 'The memorial uses water, names, and open space to make loss physically present. It asks for a different pace than the streets around it.',
          estimatedDurationSec: 22,
        },
        ru: {
          title: 'Мемориал 11 сентября',
          approachText: 'Вы приближаетесь к мемориалу 11 сентября — месту, где город замедляется.',
          arrivalText: 'Мемориал использует воду, имена и открытое пространство, чтобы сделать потерю ощутимой. Здесь нужен другой темп, чем на улицах вокруг.',
          estimatedDurationSec: 22,
        },
      },
      arthur: {
        en: {
          title: '9/11 Memorial',
          approachText: 'The memorial ahead is designed around voids, edges, and controlled sound.',
          arrivalText: 'Its power comes from spatial discipline: the pools mark absence, while the surrounding plaza keeps the city present but held at a respectful distance.',
          estimatedDurationSec: 22,
        },
        ru: {
          title: 'Мемориал 11 сентября',
          approachText: 'Впереди мемориал, построенный вокруг пустоты, границ и контролируемого звука.',
          arrivalText: 'Его сила в пространственной дисциплине: бассейны обозначают отсутствие, а площадь сохраняет город рядом, но на уважительной дистанции.',
          estimatedDurationSec: 22,
        },
      },
    },
    facts: [
      {
        text: 'The National September 11 Memorial opened to the public in 2011.',
        sourceReference: 'National September 11 Memorial & Museum public history',
        verifiedAt: '2026-07-14',
      },
    ],
    media: {
      attribution: 'No local demo image available; fallback card is intentional',
      license: 'Not applicable',
      altText: { en: '9/11 Memorial reflecting pool', ru: 'Мемориальный бассейн 11 сентября' },
    },
    route: {
      nextTargetId: 'battery-park-city-marina',
      routeCoordinates: [
        { latitude: 40.71149, longitude: -74.013371 },
        { latitude: 40.7102, longitude: -74.0148 },
        { latitude: 40.7087, longitude: -74.0167 },
        { latitude: 40.7064, longitude: -74.0174 },
      ],
      estimatedWalkSeconds: 420,
    },
    presentation: {
      mapCenter: { latitude: 40.71149, longitude: -74.013371 },
      mediaMode: 'photo',
    },
  },
  {
    id: 'battery-park-city-marina',
    sequence: 4,
    name: 'Battery Park City / Marina',
    coordinates: { latitude: 40.7064, longitude: -74.0174 },
    targetType: 'waterfront',
    categoryTags: ['waterfront', 'urban_design', 'viewpoint'],
    triggerRadii: radii,
    narratives: {
      dana: {
        en: {
          title: 'Battery Park City / Marina',
          approachText: 'The route opens toward the water now, with Battery Park City and the marina ahead.',
          arrivalText: 'Here the Financial District loosens its grip. The harbor, paths, and marina make the edge of Manhattan feel less like an ending and more like a balcony.',
          estimatedDurationSec: 20,
        },
        ru: {
          title: 'Battery Park City / Marina',
          approachText: 'Маршрут выходит к воде: впереди Battery Park City и марина.',
          arrivalText: 'Здесь Финансовый район отпускает напряжение. Гавань, дорожки и марина превращают край Манхэттена не в конец, а в балкон над водой.',
          estimatedDurationSec: 20,
        },
      },
      arthur: {
        en: {
          title: 'Battery Park City / Marina',
          approachText: 'Ahead, the city grid gives way to planned waterfront space.',
          arrivalText: 'Battery Park City is a different urban instrument: less canyon, more promenade. It shows how Lower Manhattan learned to turn back toward the harbor.',
          estimatedDurationSec: 20,
        },
        ru: {
          title: 'Battery Park City / Marina',
          approachText: 'Впереди городская сетка уступает место спланированной набережной.',
          arrivalText: 'Battery Park City работает иначе: меньше каменного каньона, больше променада. Это пример того, как Нижний Манхэттен снова повернулся к гавани.',
          estimatedDurationSec: 20,
        },
      },
    },
    facts: [
      {
        text: 'Battery Park City was developed as a planned waterfront community on landfill along the Hudson River.',
        sourceReference: 'Battery Park City Authority public overview',
        verifiedAt: '2026-07-14',
      },
    ],
    media: {
      attribution: 'No local demo image available; fallback card is intentional',
      license: 'Not applicable',
      altText: { en: 'Battery Park City waterfront and marina', ru: 'Набережная и марина Battery Park City' },
    },
    route: {
      routeCoordinates: [
        { latitude: 40.7064, longitude: -74.0174 },
      ],
      estimatedWalkSeconds: 0,
    },
    presentation: {
      mapCenter: { latitude: 40.7064, longitude: -74.0174 },
      mediaMode: 'photo',
    },
  },
];

export const tourB: DemoTour = {
  id: 'world-trade-center-waterfront',
  title: {
    en: 'World Trade Center & Waterfront',
    ru: 'World Trade Center и набережная',
  },
  description: {
    en: 'A deterministic walking demo from Trinity Church to the waterfront.',
    ru: 'Детерминированный пеший демо-маршрут от Trinity Church к набережной.',
  },
  targetIds: tourBTargets.map((target) => target.id),
  startCoordinate: tourBTargets[0].coordinates,
  endCoordinate: tourBTargets[tourBTargets.length - 1].coordinates,
  fullRouteCoordinates: tourBTargets.flatMap((target, index) =>
    index === 0 ? target.route.routeCoordinates : target.route.routeCoordinates.slice(1)
  ),
  continueDelaySec: 5,
  completionNarratives: {
    dana: {
      en: 'I hope you enjoyed the walk. Sign in or create an account to save the places you visited, return to this story later, and share the walk with friends.',
      ru: 'Надеюсь, прогулка вам понравилась. Зарегистрируйтесь или войдите, чтобы сохранить посещённые места, вернуться к этой истории позже и поделиться прогулкой с друзьями.',
    },
    arthur: {
      en: 'The route is complete. Sign in or create an account to save this sequence of places, revisit the walk later, and share it.',
      ru: 'Маршрут завершен. Зарегистрируйтесь или войдите, чтобы сохранить эту последовательность мест, вернуться к прогулке позже и поделиться ей.',
    },
  },
};
