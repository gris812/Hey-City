#**План разработки Sunshine AI Guide (MVP)**

##**Стек и репозиторий**

- **Мобильное приложение:** React Native (одна кодовая база iOS +
  Android).

- **Backend:** TypeScript + Express (рекомендация: единый язык с RN,
  сильная I/O для пингов и кэша; альтернатива — Python/FastAPI при
  предпочтении команды).

- **Репозиторий:** отдельный новый репозиторий (не Sunshine-EV-Classic).

##**Высокоуровневая архитектура**

flowchart LR

subgraph client \[Mobile App\]

Maps\[Maps SDK\]

Live\[Live / Vehicle\]

Settings\[Settings\]

History\[History UI\]

end

subgraph backend \[Backend\]

Auth\[Auth email-OTP\]

Drive\[Drive Discovery\]

Narration\[Narration + TTS\]

Places\[Places/Matrix proxy\]

Redis\[(Redis cache)\]

end

subgraph external \[External\]

Google\[Google Maps Platform\]

TTS\[TTS Provider\]

LLM\[LLM API\]

Storage\[S3/GCS audio\]

end

client --\> backend

backend --\> Redis

backend --\> Google

backend --\> TTS

backend --\> LLM

backend --\> Storage

- Все ключи Google только на backend; клиент вызывает только свои API.

- Клиент: отображение карты (Maps SDK), экраны Live/Vehicle, настройки,
  история; воспроизведение аудио (стрим/файл + кэш).

##**1. Структура репозитория (новый repo)**

Предлагаемая структура:

- \*\*/mobile\*\* — React Native (Expo или bare; для фона и геолокации в
  Vehicle — проверить ограничения Expo).

- \*\*/backend\*\* — Node.js + TypeScript, Express, все эндпоинты и
  логика Drive Discovery, квоты, кэш.

- \*\*/shared\*\* (опционально) — общие типы/контракты API (TypeScript),
  чтобы не дублировать DTO между mobile и backend.

Корень: package.json (workspaces) или два отдельных package.json в
mobile/ и backend/.

##**2. Backend: основные модули и конфиг**

- **Конфиг (обязательно не хардкод):** все интервалы и лимиты в конфиге
  (env + конфиг-файл), например:

  - PING_INTERVAL_SEC, PLACES_REFRESH_SEC, MATRIX_REFRESH_SEC,
    MIN_GAP_BETWEEN_STORIES_SEC, STORY_LEAD_TIME_MIN_DEFAULT

  - K_DESTINATIONS, MAX_GOOGLE_CALLS_PER_MINUTE_PER_USER,
    MAX_PLACES_CALLS_PER_MINUTE_PER_USER,
    MAX_MATRIX_CALLS_PER_MINUTE_PER_USER

  - Пороги скорости (15 км/ч — не считать авто; 20–40, 40–80, 80+ для
    адаптации частот), расстояния вперёд (0.8 / 1.5 / 2.5 км),
    разрешённые/запрещённые типы Places.

- **Модули:** Auth (email-OTP), Drive Discovery (session, ping handler,
  выбор POI, ETA, триггер рассказа), Places service (Nearby + кэш, без
  лишних Place Details), Distance Matrix service (только для топ-K,
  кэш), Narration (LLM + TTS, кэш текста и аудио), History/Privacy
  (сохранение по умолчанию, opt-out, DELETE). Плюс middleware:
  rate-limit по user/IP, circuit breaker при 429 от Google, бюджетные
  лимиты (деградация при превышении — реже запросы, использование кэша).

##**3. Auth и профиль**

- **Auth:** только backend; email-OTP (отправка кода, проверка, выдача
  токена). Мобильное приложение хранит токен и передаёт в заголовках.

- **Профиль:** поле languageDefault (ru/en/auto), блок driveDiscovery:
  enabled, themeTags\[\], narrationStyle, lengthSec, leadTimeMin,
  autoplay, voiceId. Плюс настройки приватности: история включена по
  умолчанию, opt-out и удаление через API.

##**4. API (ключевые эндпоинты)**

- **Drive Discovery session:**

  - POST /drive/session/start — тело: параметры режима (theme, style,
    length, leadTime, voiceId и т.д.) → { sessionId }.

  - POST /drive/session/stop — завершение сессии.

  - POST /drive/session/ping — тело: sessionId, lat, lng, heading,
    speed, timestamp. Ответ: nextAction: "PLAY" \| "NONE", при PLAY —
    poi, audioUrl, textPreview. Логика на backend: при низкой скорости /
    mute / background не дергать Google; соблюдать PLACES_REFRESH_SEC /
    MATRIX_REFRESH_SEC и MIN_GAP_BETWEEN_STORIES_SEC; выдавать PLAY
    только когда ETA ≤ leadTime и ETA ≥ 20 сек.

- **Кандидаты POI (опционально отдельно или внутри ping):**

  - POST /drive/poi/candidates — lat, lng, heading, speed, themeTags\[\]
    → { candidates\[\] }. Использовать для двухступенчатого отбора:
    сначала кандидаты (1–2 Nearby Search), потом Matrix только для K=6.

- **Narration:**

  - POST /narration/generate — poiId, lang, theme, style, lengthSec,
    voiceId, context: "drive_discovery" → { audioUrl, transcriptText,
    cached }. Backend: генерация текста по шаблону (LLM), TTS,
    сохранение в S3/GCS, отдача подписанной ссылки; кэш по ключу
    (poiId + lang + theme + style + length_bucket + voiceId), TTL 30
    дней.

- **История/приватность:**

  - PUT /me/privacy — historyEnabled: false (opt-out).

  - DELETE /me/history — полное удаление.

  - DELETE /me/history/items — тело { ids\[\] } — выборочное удаление.

##**5. Drive Discovery: логика на backend**

- **Вход ping:** раз в ~10 сек (PING_INTERVAL_SEC) клиент шлёт
  координаты, heading, speed. Не вызывать Google, если скорость \&lt; 15
  км/ч, режим не Vehicle, пользователь слушает рассказ и до конца \&gt;
  20 сек, mute, или приложение в background (минимальные пинги без
  Places/Matrix).

- **Кандидаты (шаг A):** не чаще PLACES_REFRESH_SEC (30 сек). Точка
  впереди: расстояние 0.8 / 1.5 / 2.5 км в зависимости от скорости; 1–2
  запроса Nearby Search (вокруг точки впереди + опционально вокруг
  текущей с меньшим радиусом). Кэш: ключ geohash(7) + headingBucket(8) +
  speedBucket + theme, TTL 2–5 мин. Фильтрация: только разрешённые типы
  (tourist_attraction, museum, park, church, …), исключить gas_station,
  convenience_store и т.д.; рейтинг ≥ 4.2 или user_ratings_total ≥ 250
  (конфиг). Ранжирование: тема, популярность, уникальность (не подряд
  одна категория), примерная близость → топ K=6.

- **ETA (шаг B):** Distance Matrix только для этих K (макс 6). Ключ
  кэша: origin_geohash + destinations_hash + departure_bucket(5 мин),
  TTL 2 мин. Не чаще MATRIX_REFRESH_SEC; при уже выбранном “следующем
  POI” с валидным ETA не перезапрашивать, пока смещение \&lt; 500 м или
  не истекло время. Выбор одного POI для следующего рассказа: ETA ≤
  leadTime (настройка 0.5–6 мин, по умолчанию 2), ETA ≥ 20 сек,
  соблюдение MIN_GAP_BETWEEN_STORIES_SEC (2.5 мин).

- **Анти-повторы:** не рассказывать тот же POI 24 часа; по возможности
  не подряд одна категория. Fallback: при быстрой езде можно триггерить
  по distance \&lt; 1.2 км, если ETA не успели.

- **Budget guardrails:** счётчики вызовов Google по user/minute; при
  превышении MAX\_\* — graceful degradation (реже запросы, двойные
  интервалы, ответ из кэша). Circuit breaker: при 429 от Google —
  отключить Drive Discovery на 60 сек и вернуть “временно ограничено”.
  Логирование вызовов по user/day для контроля расходов.

##**6. Контент и TTS**

- **Шаблон рассказа (Drive Discovery):** 1 фраза “что это и почему
  важно”; 2–4 факта по тематике; 1 “крючок”; завершение “Если хотите —
  сохраню и дам подробнее позже”. Длина 60–180 сек (настройка, по
  умолчанию 90).

- **Генерация:** LLM по шаблону + Place Details (только когда POI выбран
  для рассказа; кэш Place Details по place_id 30 дней). Кэш текста: ключ
  poiId + lang + theme + style + length_bucket, TTL 30 дней.

- **TTS:** облачный провайдер на backend; каталог голосов (voiceId,
  displayName, lang, gender, providerVoiceName, sampleUrl). Аудио в
  S3/GCS, подписанные ссылки; кэш по storyHash + voiceId, TTL 30 дней.
  Клиент: воспроизведение по URL, локальный кэш аудио.

##**7. Мобильное приложение (React Native)**

- **Экраны:** онбординг (язык устройства → defaultLanguage), карта/Live,
  режим Vehicle с блоком “Режим в авто”: переключатель Quick Facts /
  Drive Discovery. При выборе Drive Discovery — bottom sheet с
  настройками: тематики (multi-select chips), стиль (single), длина
  (slider 30–180), “за N минут до подъезда” (slider 0.5–6, default 2),
  голос, авто-плей (toggle). Крупные кнопки: Mute, Pause, Skip,
  “Подробнее позже” (сохранить без длинного текста на экране). Настройки
  приложения: история (вкл/выкл, “Удалить всё”, выборочная очистка),
  голос, язык.

- **Vehicle Mode:** определение по скорости/контексту (или явный
  переключатель); при активном Drive Discovery — отправка ping по
  PING_INTERVAL_SEC (с учётом background ограничений iOS/Android —
  минимальные пинги в фоне). При ответе nextAction: "PLAY" —
  загрузка/кэш аудио и воспроизведение; отображение textPreview
  минимально (без длинных текстов во время движения).

- **Карта:** только Maps SDK (Google); без ключей Places/Directions на
  клиенте. Маршруты и экскурсии — через backend (Directions API на
  backend).

##**8. Язык RU/EN**

- Чат/запросы: определение языка по вводу пользователя (локально или на
  backend).

- Drive Discovery (без запроса): язык из профиля defaultLanguage (при
  онбординге — язык устройства). Если в поездке пользователь сказал
  фразу на другом языке — переключить sessionLanguage до конца поездки.

##**9. Чек-лист реализации (обязательно)**

- Все интервалы и лимиты — из конфига.

- Places → ранжирование → Matrix только для топ K (≤6).

- Place Details только по явному intent или выбранному POI для рассказа;
  кэш 30 дней.

- Кэш на backend (Redis/Upstash): Nearby, Matrix, текст рассказа, ссылки
  на TTS.

- Budget guardrails + graceful degradation + логи вызовов Google по
  user/day.

- Default “за N минут” = 2 минуты в настройках и в конфиге.

##**10. Порядок реализации (рекомендуемый)**

1.  Репозиторий и скелет: backend (Express + конфиг), mobile (React
    Native), общие типы API.

2.  Auth: email-OTP на backend, экран входа в приложении.

3.  Профиль и настройки: сохранение driveDiscovery и privacy; экран
    настроек.

4.  Базовые сервисы backend: Google Places (Nearby + кэш), Distance
    Matrix (K=6, кэш), конфиг и лимиты.

5.  Narration: LLM + TTS, кэш, эндпоинт POST /narration/generate.

6.  Drive Discovery backend: session start/stop/ping, двухступенчатый
    отбор, триггер по ETA, анти-повторы, guardrails.

7.  Экран Live/Vehicle в приложении: переключатель Quick Facts / Drive
    Discovery, bottom sheet настроек, пинг, воспроизведение по audioUrl.

8.  История и приватность: сохранение по умолчанию, API opt-out и
    удаления, UI в настройках.

9.  Режим “экскурсия” (маршрут): Directions API на backend, клиент
    строит маршрут и запрашивает факты по POI на маршруте (отдельная
    итерация после Drive Discovery).

10. Тестирование приёмки Drive Discovery по критериям из ТЗ и замер
    расходов Google API.

Этот план покрывает ТЗ (A–I, X–XI) и даёт однозначную основу для
реализации в отдельном репозитории с React Native и TypeScript/Express
backend.
