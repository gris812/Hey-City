# Sunshine AI Guide — пошаговые инструкции

Документ описывает три блока: вынос в отдельный репозиторий, настройку Google Maps в мобилке и доработку TTS/LLM в бэкенде.

---

## 1. Вынос в отдельный репозиторий

### 1.1. Создать новый репозиторий на GitHub

1. Зайдите на GitHub → **New repository**.
2. Название, например: `sunshine-ai-guide`.
3. **Не** добавляйте README, .gitignore, license — репозиторий должен быть пустым.
4. Создайте репозиторий и скопируйте URL (например `https://github.com/USER/sunshine-ai-guide.git`).

### 1.2. Перенести только папку sunshine-ai-guide

На своей машине в каталоге, где лежит клон **Sunshine-EV-Classic**:

```bash
# Клонировать текущий репо во временную папку (если ещё не клонирован)
cd ~/Documents/GitHub
git clone https://github.com/USER/Sunshine-EV-Classic.git sunshine-ai-guide-temp
cd sunshine-ai-guide-temp

# Оставить только папку sunshine-ai-guide в истории (filter-branch или git subtree)
git filter-repo --path sunshine-ai-guide --path-rename sunshine-ai-guide:.

# Либо вручную: создать новый репо и скопировать файлы
cd ..
mkdir sunshine-ai-guide-repo
cd sunshine-ai-guide-repo
git init
cp -r Sunshine-EV-Classic/sunshine-ai-guide/* .
cp Sunshine-EV-Classic/sunshine-ai-guide/.gitignore . 2>/dev/null || true
git add .
git commit -m "Initial: Sunshine AI Guide (backend + mobile)"
git remote add origin https://github.com/USER/sunshine-ai-guide.git
git branch -M main
git push -u origin main
```

**Вариант без filter-repo (просто скопировать файлы):**

```bash
cd ~/Documents/GitHub
mkdir sunshine-ai-guide && cd sunshine-ai-guide
git init
cp -r ../Sunshine-EV-Classic/sunshine-ai-guide/backend .
cp -r ../Sunshine-EV-Classic/sunshine-ai-guide/mobile .
cp ../Sunshine-EV-Classic/sunshine-ai-guide/README.md .
cp ../Sunshine-EV-Classic/sunshine-ai-guide/.gitignore .
mkdir -p docs && cp ../Sunshine-EV-Classic/sunshine-ai-guide/docs/SETUP_AND_NEXT_STEPS.md docs/
git add .
git commit -m "Initial: Sunshine AI Guide"
git remote add origin https://github.com/USER/sunshine-ai-guide.git
git push -u origin main
```

### 1.3. Дальнейшая разработка

Клонируйте уже **новый** репозиторий и работайте в нём:

```bash
git clone https://github.com/USER/sunshine-ai-guide.git
cd sunshine-ai-guide
```

---

## 2. Настройка Google Maps в мобильном приложении

Клиент использует **только Maps SDK** для отображения карты. Ключи Places/Directions/Distance Matrix — только на backend.

### 2.1. Ключи в Google Cloud Console

1. Откройте [Google Cloud Console](https://console.cloud.google.com/).
2. Создайте проект или выберите существующий.
3. Включите **Maps SDK for Android** и **Maps SDK for iOS** (APIs & Services → Library).
4. Создайте два ключа (Credentials → Create credentials → API key):
   - **Android:** ограничьте по типу «Android apps», укажите package name `com.sunshine.aiguide` и SHA-1 отпечаток (для release — свой keystore).
   - **iOS:** ограничьте по типу «iOS apps», укажите bundle ID `com.sunshine.aiguide`.

Не давайте этим ключам доступ к Places/Directions/Matrix — только Maps SDK.

### 2.2. Установка и настройка react-native-maps (Expo)

В проекте уже есть зависимость `react-native-maps`. Для Expo используется конфиг-плагин.

1. **app.json** — добавьте плагин и ключи:

```json
{
  "expo": {
    "name": "Sunshine AI Guide",
    "slug": "sunshine-ai-guide",
    "plugins": [
      "expo-location",
      "expo-secure-store",
      [
        "react-native-maps",
        {
          "useGoogleMaps": true
        }
      ]
    ],
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_IOS_MAPS_KEY"
      }
    },
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_MAPS_KEY"
        }
      }
    }
  }
}
```

2. Ключи лучше не коммитить. Используйте переменные окружения:

```json
"ios": {
  "config": {
    "googleMapsApiKey": "${EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY}"
  }
},
"android": {
  "config": {
    "googleMaps": {
      "apiKey": "${EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY}"
    }
  }
}
```

В корне `mobile/` создайте `.env`:

```
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_ios_key
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=your_android_key
```

И добавьте `.env` в `.gitignore` (если ещё не добавлен).

### 2.3. Разрешения локации

Для Vehicle Mode и пингов нужна геолокация. В **app.json** уже есть плагин `expo-location`. Для фона (опционально) укажите:

```json
"ios": {
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "Нужна для рассказов о местах по пути.",
    "NSLocationAlwaysAndWhenInUseUsageDescription": "Для режима в авто при поездке."
  }
},
"android": {
  "permissions": ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"]
}
```

### 2.4. Экран карты с картой

Замените заглушку в `mobile/src/screens/MapScreen.tsx` на отображение карты:

```tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';

export function MapScreen() {
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    })();
  }, []);

  if (!region) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
});
```

После этого пересоберите приложение (`npx expo prebuild` при использовании development build или EAS Build).

### 2.5. Итог по карте

- Ключи только для **Maps SDK** (Android + iOS), ограничены по приложению.
- Backend держит свой ключ для Places, Distance Matrix, Directions — в `.env` бэкенда (`GOOGLE_MAPS_API_KEY` или отдельные ключи при необходимости).

---

## 3. Доработка TTS и LLM в бэкенде

Сейчас в `backend/src/services/narration.ts`: текст по шаблону без LLM, TTS — заглушка (возвращается placeholder URL). Ниже — как подключить реальные сервисы.

### 3.1. Place Details перед генерацией текста

Place Details вызывать **только** когда POI уже выбран для рассказа (или по явному действию пользователя). В `narration.ts` уже есть заглушка `getPlaceDetails(placeId)`.

1. Добавьте вызов Google Place Details API (один запрос на один `place_id`).
2. Кэшируйте ответ по `placeDetailsCacheKey(placeId)` на 30 дней (см. `config.cacheTtl.placeDetailsDays`).
3. В `generateStoryText` передавайте в LLM: имя места, типы, рейтинг, описание из Place Details (поля `name`, `types`, `rating`, `editorial_summary` или `formatted_address` — по необходимости).

Пример запроса (в отдельном сервисе, например `googlePlaceDetails.ts`):

```ts
const url = `https://maps.googleapis.com/maps/api/place/details/json?key=${apiKey}&place_id=${placeId}&fields=name,types,rating,user_ratings_total,editorial_summary,formatted_address`;
const res = await fetch(url);
const data = await res.json();
// data.result — положить в кэш и вернуть
```

### 3.2. Подключение LLM для текста рассказа

Шаблон из ТЗ: одна фраза «что это и почему важно», 2–4 факта по тематике, один «крючок», завершение «Если хотите — сохраню и дам подробнее позже».

1. В `.env` бэкенда задайте, например:
   - `LLM_PROVIDER=openai`
   - `OPENAI_API_KEY=sk-...`

2. В `backend/src/services/narration.ts` в функции `generateStoryText`:
   - примите аргумент с данными места (из Place Details);
   - сформируйте системный промпт с правилами: язык `input.lang`, тема `input.theme`, стиль `input.style`, целевая длина в словах (например ~15 слов на 10 сек при 90 сек);
   - в user-сообщении передайте: название, типы, рейтинг, описание места;
   - вызовите API (OpenAI/другой), получите один блок текста;
   - при необходимости обрежьте до нужной длины и верните строку.

Пример вызова OpenAI (добавить зависимость `openai`):

```ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sysPrompt = `Ты экскурсовод. Пиши коротко, по делу. Язык: ${input.lang}. Тема: ${input.theme}. Стиль: ${input.style}. Структура: 1) что это и почему важно; 2) 2-4 факта по теме; 3) одна любопытная деталь; 4) фраза "Если хотите — сохраню и дам подробнее позже." Цель: около 150-200 слов для 90 сек.`;

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: `Место: ${placeName}. Типы: ${types}. Описание: ${description}.` },
  ],
  max_tokens: 400,
});
const text = completion.choices[0]?.message?.content?.trim() ?? '';
```

Подставьте `placeName`, `types`, `description` из Place Details. Кэш текста уже есть по ключу `storyTextCacheKey(...)` — менять не нужно.

### 3.3. Подключение облачного TTS

Цель: из текста получить аудио, сохранить в S3/GCS и отдать клиенту подписанный URL.

1. **Google Cloud TTS** (пример):
   - Включите Cloud Text-to-Speech API, создайте service account, скачайте JSON.
   - В `.env`: `GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json`.
   - В коде используйте `@google-cloud/text-to-speech`: синтез в buffer, загрузка buffer в хранилище.

2. В `backend/src/services/narration.ts` в функции `synthesizeSpeech`:
   - примите `text`, `voiceId`, `lang`;
   - по `voiceId` выберите голос из каталога (например маппинг `voiceId` → `languageCode` и `name` для Google TTS);
   - вызовите TTS API, получите аудио (например MP3);
   - загрузите в S3/GCS с ключом вида `tts/${storyHash}_${voiceId}.mp3`;
   - сгенерируйте подписанный URL (например `getSignedUrl` для GCS или S3) с TTL 1–2 часа;
   - сохраните в кэш по `ttsAudioCacheKey(storyHash, voiceId)` сам URL или путь к объекту (как удобнее);
   - верните этот URL как `audioUrl`.

3. **Каталог голосов** уже отдаётся с `GET /narration/voices`. Добавьте в объекты голосов поля `providerVoiceName` и при необходимости `languageCode`, чтобы в TTS вызывать правильное имя голоса провайдера.

### 3.4. Хранилище аудио (S3 или GCS)

- **Локально (dev):** сохраняйте файлы в папку `backend/uploads/tts/`, раздавайте через статику Express или отдельный роут с `res.sendFile`.
- **Production:** используйте бакет S3 или GCS, загрузку через AWS SDK или `@google-cloud/storage`, подписанные URL с ограниченным временем жизни.

Пример для GCS (после `npm i @google-cloud/storage`):

```ts
import { Storage } from '@google-cloud/storage';
const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);
const file = bucket.file(`tts/${storyHash}_${voiceId}.mp3`);
await file.save(audioBuffer, { contentType: 'audio/mpeg' });
const [signedUrl] = await file.getSignedUrl({
  action: 'read',
  expires: Date.now() + 2 * 60 * 60 * 1000, // 2 часа
});
return signedUrl;
```

### 3.5. Чек-лист по контенту и TTS

- [ ] Place Details вызываются только для выбранного POI и кэшируются на 30 дней.
- [ ] Текст рассказа генерируется через LLM с учётом места, темы, стиля и длины; кэш текста по `poiId+lang+theme+style+length_bucket`.
- [ ] TTS вызывается после генерации текста; аудио сохраняется в S3/GCS, в ответ отдаётся подписанный URL.
- [ ] Аудио кэшируется по `storyHash+voiceId`, TTL 30 дней.
- [ ] Каталог голосов (`/narration/voices`) содержит `providerVoiceName` (и при необходимости `languageCode`) для выбранного провайдера TTS.

---

## 4. Canonical docs and project context

Before coding, convert the main project documents into markdown and place them in:

- `docs/context/`
- `docs/reference/`

Primary canonical docs:
- `AI_Guide_Brain_Unified_Architecture_v2_Canonical.md`
- `Product_Architecture_v1.md`
- `Hey_City_MVP_API_Specification_v1.md`
- `Hey_City_Story_Engine_Logic.md`
- `Development_Plan.md`

Secondary docs:
- `Platform_Master_Blueprint_v1.md`
- `City_Knowledge_Graph_Technical_Specification_v1.md`
- `MVP_City_Dataset_Pack_v2.md`
- `Product_Experience_Map_v1.md`

---

## 5. Cursor setup

Create:
- `AGENTS.md`
- `.cursor/rules/`
- `data/guides/DANA.json`
- `data/guides/ARTUR.json`

Recommended Cursor workflow:
1. read canonical docs
2. create a plan
3. implement only one slice at a time
4. review implementation against the canonical docs

---

## 6. Rule files

Recommended rules:
- `00-project-canon.mdc`
- `10-backend-architecture.mdc`
- `20-mobile-architecture.mdc`
- `30-ai-generation.mdc`
- `40-doc-usage.mdc`

---

## 7. First engineering slice

Implement first:

Drive Discovery Engine v1 with:
- session start / stop
- session context updates
- state machine
- context normalization
- candidate locking
- cooldown logic
- deterministic trigger decision

Do not implement full LLM freedom.
Brain/services decide.
LLM only generates story text from a structured narrative plan.

---

