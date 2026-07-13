#**🧠 1. Microservices Architecture (Production-ready)**

##**🔹 1. Context Service**

**Что делает:**

- собирает location / speed / heading

- нормализует данные

- формирует ContextSnapshot

**Input:**

- GPS stream (mobile)

- session updates

**Output:**

ContextSnapshot

##**🔹 2. Discovery Service**

(= Drive Discovery Engine)

**Что делает:**

- ищет POI рядом

- считает distance / ETA

- применяет direction logic

**Связан с:**

- POI DB

- Map API

**Output:**

candidate_pois\[\]\
active_poi

##**🔹 3. Story Selection Service**

**Что делает:**

- выбирает лучший POI

- выбирает story type

**Логика:**

- importance

- proximity

- theme

- continuity

##**🔹 4. Narrative Planning Service**

🔥 **самый важный сервис**

**Что делает:**

- строит NarrativePlan

- НЕ генерирует текст

**Output:**

NarrativePlan

##**🔹 5. Narrative Generation Service (LLM)**

**Что делает:**

- превращает NarrativePlan → текст

**Input:**

- plan

- persona

- constraints

##**🔹 6. Timing Engine Service**

**Что делает:**

- адаптирует длину истории

- решает expand / compress

##**🔹 7. Conversation Service**

**Что делает:**

- обрабатывает вопросы

- intent detection

- follow-ups

##**🔹 8. Persona Service**

**Что делает:**

- хранит профили гидов

- отдает параметры

##**🔹 9. Memory Service**

**Что делает:**

- хранит user signals

- предпочтения

- историю

##**🔹 10. Delivery Service**

**Что делает:**

- TTS

- аудио

- playback timing

- caching

##**🔹 11. Safety Service**

**Что делает:**

- ограничивает:

  - длину

  - частоту

  - сложность

👉 Может “зарезать” историю

#**🧱 2. Как это работает вместе (pipeline)**

Mobile → Context Service\
↓\
Discovery Service\
↓\
Story Selection\
↓\
Narrative Planning\
↓\
Timing Engine\
↓\
Safety Check\
↓\
Narrative Generation (LLM)\
↓\
Delivery (TTS)\
↓\
Audio Playback

#**🔗 3. API Mapping (связка с твоим MVP API)**

Ты уже почти всё описал в:

Теперь связываем.

##**🔹 Endpoint → Service**

**1. /discovery/active-poi**

👉 Context + Discovery + Selection

**2. /stories/generate**

👉 Narrative Planning + LLM + Timing

**3. /stories/continue**

👉 Story Graph + Lookahead + Timing

**4. /guide/ask**

👉 Conversation Service + LLM

**5. /sessions/context**

👉 Context Service update

#**🧠 4. Важное правило архитектуры**

👉 **LLM НЕ принимает решения**

LLM только:

- генерирует текст

Все решения:

- Brain (services)

#**🧑‍💻 5. Engineering Tasks (под твою команду)**

Ты писал:

- mobile dev

- backend dev

- AI engineer

- product/content

Раздаю задачи 👇

##**👨‍💻 BACKEND DEVELOPER**

**🔥 Sprint 1**

- Setup Node.js + TypeScript + Express

- Implement /auth

- Implement /me

**🔥 Sprint 2**

- /pois/nearby

- POI DB schema

- basic scoring logic

**🔥 Sprint 3**

- /discovery/active-poi

- integrate distance + heading

**🔥 Sprint 4**

- /stories/generate

- integrate Narrative Planner

**🔥 Sprint 5**

- sessions API

- state management

##**🤖 AI / INFRA ENGINEER**

**🔥 Sprint 1**

- NarrativePlan schema

- prompt templates

**🔥 Sprint 2**

- LLM integration

- persona conditioning

**🔥 Sprint 3**

- story compression logic

- story expansion logic

**🔥 Sprint 4**

- follow-up responses

- Q&A

##**📱 MOBILE DEVELOPER**

**🔥 Sprint 1**

- Map screen (Google Maps SDK)

- user location tracking

**🔥 Sprint 2**

- POI rendering

- active POI highlight

**🔥 Sprint 3**

- audio player

- autoplay logic

**🔥 Sprint 4**

- Ask Guide UI

- Save Place

##**🎯 PRODUCT / CONTENT**

**🔥 Sprint 1**

- define 100 POI (NYC)

- assign themes

**🔥 Sprint 2**

- create story seeds

- define guide tones

**🔥 Sprint 3**

- QA narrative quality

- test flows

#**⚠️ 6. Самая частая ошибка (предупреждаю заранее)**

❌ Делать так:

LLM сам решает что рассказать

👉 Это убьёт продукт

✅ Правильно:

- Brain решает

- LLM формулирует

#**🚀 7. Как это передавать в Cursor / Agent Swarm**

👉 Каждая задача = отдельный prompt

Пример:

##**Prompt для backend:**

Implement endpoint /discovery/active-poi\
\
Input:\
lat, lng, speed, heading\
\
Logic:\
- fetch nearby POIs\
- calculate distance\
- filter by threshold\
- return best POI\
\
Output JSON:\
{ poi, distance, eta, trigger_story }

##**Prompt для AI:**

Generate story based on NarrativePlan:\
\
Constraints:\
- duration: 20 sec\
- tone: Sophia\
- theme: architecture\
\
Output:\
- text\
- short version
