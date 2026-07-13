**HEY CITY**

**Product Architecture v1**

Version: 1.0\
Date: 2026-03-15

# Table of Contents

[1. System Overview [1](#_Toc224475918)](#_Toc224475918)

[2. Core Architectural Principles [2](#_Toc224475919)](#_Toc224475919)

[2.1 Map-First Interaction [2](#_Toc224475920)](#_Toc224475920)

[2.2 Voice-First Interaction [2](#_Toc224475921)](#_Toc224475921)

[2.3 Ambient Intelligence [2](#_Toc224475922)](#_Toc224475922)

[2.4 Graph-Based Knowledge [3](#_Toc224475923)](#_Toc224475923)

[2.5 Safety First [3](#_Toc224475924)](#_Toc224475924)

[3. High-Level System Architecture [3](#_Toc224475925)](#_Toc224475925)

[Client Layer [3](#_Toc224475926)](#_Toc224475926)

[Backend Layer [4](#_Toc224475927)](#_Toc224475927)

[Intelligence Layer [4](#_Toc224475928)](#_Toc224475928)

[4. Mobile Application Architecture [4](#_Toc224475929)](#_Toc224475929)

[Основные модули клиента [4](#_Toc224475930)](#_Toc224475930)

[Основные экраны [5](#_Toc224475931)](#_Toc224475931)

[Vehicle Mode [5](#_Toc224475932)](#_Toc224475932)

[5. Backend Architecture [5](#_Toc224475933)](#_Toc224475933)

[Основные сервисы [5](#_Toc224475934)](#_Toc224475934)

[Backend responsibilities [6](#_Toc224475935)](#_Toc224475935)

[6. Drive Discovery Engine [6](#_Toc224475936)](#_Toc224475936)

[Основной алгоритм [6](#_Toc224475937)](#_Toc224475937)

[Candidate selection [6](#_Toc224475938)](#_Toc224475938)

[ETA calculation [6](#_Toc224475939)](#_Toc224475939)

[7. AI Guide Brain [7](#_Toc224475940)](#_Toc224475940)

[Основные компоненты [7](#_Toc224475941)](#_Toc224475941)

[8. City Knowledge Graph [7](#_Toc224475942)](#_Toc224475942)

[Основные сущности [7](#_Toc224475943)](#_Toc224475943)

[Relationships [8](#_Toc224475944)](#_Toc224475944)

[Example [8](#_Toc224475945)](#_Toc224475945)

[9. Story Generation Pipeline [8](#_Toc224475946)](#_Toc224475946)

[Step 1 [8](#_Toc224475947)](#_Toc224475947)

[Step 2 [8](#_Toc224475948)](#_Toc224475948)

[Step 3 [9](#_Toc224475949)](#_Toc224475949)

[Step 4 [9](#_Toc224475950)](#_Toc224475950)

[Step 5 [9](#_Toc224475951)](#_Toc224475951)

[10. Conversation System [9](#_Toc224475952)](#_Toc224475952)

[Example interactions [9](#_Toc224475953)](#_Toc224475953)

[11. Personalization System [9](#_Toc224475954)](#_Toc224475954)

[Signals [9](#_Toc224475955)](#_Toc224475955)

[12. Creator Platform Architecture [10](#_Toc224475956)](#_Toc224475956)

[Creator tools [10](#_Toc224475957)](#_Toc224475957)

[13. Data Pipelines [10](#_Toc224475958)](#_Toc224475958)

[14. Storage Architecture [10](#_Toc224475959)](#_Toc224475959)

[15. API Layer [11](#_Toc224475960)](#_Toc224475960)

[16. Caching Strategy [11](#_Toc224475961)](#_Toc224475961)

[17. Cost Control Architecture [11](#_Toc224475962)](#_Toc224475962)

[Cost mitigation [11](#_Toc224475963)](#_Toc224475963)

[18. Safety and Vehicle Mode [11](#_Toc224475964)](#_Toc224475964)

[Rules [12](#_Toc224475965)](#_Toc224475965)

[19. Scalability Model [12](#_Toc224475966)](#_Toc224475966)

[20. Security and Privacy [12](#_Toc224475967)](#_Toc224475967)

[Privacy controls [12](#_Toc224475968)](#_Toc224475968)

[21. Observability [12](#_Toc224475969)](#_Toc224475969)

[22. Deployment Architecture [13](#_Toc224475970)](#_Toc224475970)

[Components [13](#_Toc224475971)](#_Toc224475971)

[23. Future Architecture Evolution [13](#_Toc224475972)](#_Toc224475972)

[AR Layer [13](#_Toc224475973)](#_Toc224475973)

[City Digital Twin [13](#_Toc224475974)](#_Toc224475974)

[AI Companions [13](#_Toc224475975)](#_Toc224475975)

[Final Summary [14](#_Toc224475976)](#_Toc224475976)

<span id="_Toc224475918" class="anchor"></span>**1. System Overview**

Hey City — это **AI-платформа для исследования городов**.

Система объединяет:

- location intelligence

- conversational AI

- city knowledge graph

- adaptive storytelling

Основная функция системы — **рассказывать истории о городе в правильный
момент**.

Это достигается через интеграцию ключевых систем:

1.  City Knowledge Graph

2.  Story Graph

3.  AI Guide Brain

4.  Adaptive Narrative Engine

**Story Graph Service**

The Story Graph Service manages narrative connections between Story
Nodes.

It allows the AI Guide Brain to construct continuous storytelling
sequences based on:

- spatial proximity

- thematic continuity

- historical relationships

- route context

The Story Graph enables adaptive narrative assembly and supports
different storytelling modes:

- walking mode

- driving mode

- creator tour mode

Story Nodes are linked through narrative edges, allowing the system to
maintain storytelling continuity even when the user's route changes.

<span id="_Toc224475919" class="anchor"></span>**2. Core Architectural
Principles**

Архитектура продукта строится на следующих принципах.

<span id="_Toc224475920" class="anchor"></span>**2.1 Map-First
Interaction**

Основной интерфейс пользователя — карта.

Карта используется как **основной контекст взаимодействия**.

<span id="_Toc224475921" class="anchor"></span>**2.2 Voice-First
Interaction**

Гиды являются основным интерфейсом.

Пользователь может говорить:

“Hey Sophia, tell me more about this building.”

<span id="_Toc224475922" class="anchor"></span>**2.3 Ambient
Intelligence**

Система может инициировать рассказы без запроса пользователя.

Это называется:

**Ambient Storytelling**

<span id="_Toc224475923" class="anchor"></span>**2.4 Graph-Based
Knowledge**

Город моделируется как граф знаний.

Это позволяет AI находить связи между:

- местами

- событиями

- людьми

- историями.

<span id="_Toc224475924" class="anchor"></span>**2.5 Safety First**

Особенно в Vehicle Mode.

Минимум визуальных элементов.

Audio-first experience.

<span id="_Toc224475925" class="anchor"></span>**3. High-Level System
Architecture**

Система состоит из трех слоев.

<span id="_Toc224475926" class="anchor"></span>**Client Layer**

Mobile App (React Native)

Основные функции:

- карта

- voice interface

- audio playback

- UI

<span id="_Toc224475927" class="anchor"></span>**Backend Layer**

Node.js + TypeScript + Express

Основные функции:

- Drive Discovery

- POI selection

- narration

- conversation

<span id="_Toc224475928" class="anchor"></span>**Intelligence Layer**

AI services:

- LLM

- TTS

- knowledge graph

<span id="_Toc224475929" class="anchor"></span>**4. Mobile Application
Architecture**

Mobile app реализуется на **React Native**.

Это позволяет использовать одну кодовую базу для:

iOS\
Android

<span id="_Toc224475930" class="anchor"></span>**Основные модули
клиента**

Map Module\
Drive Mode Module\
Audio Player\
Voice Input\
Settings\
History

<span id="_Toc224475931" class="anchor"></span>**Основные экраны**

Onboarding\
Guide Selection\
Map Explore\
Story Player\
Saved Stories\
Settings

<span id="_Toc224475932" class="anchor"></span>**Vehicle Mode**

В автомобиле интерфейс упрощается.

На экране остаются:

- карта

- текущий рассказ

- mute

- skip

<span id="_Toc224475933" class="anchor"></span>**5. Backend
Architecture**

Backend реализуется на:

Node.js + Express + TypeScript.

<span id="_Toc224475934" class="anchor"></span>**Основные сервисы**

Auth Service\
Drive Discovery Service\
Places Service\
Narration Service\
Conversation Service\
User Profile Service

<span id="_Toc224475935" class="anchor"></span>**Backend
responsibilities**

- API orchestration

- Google API proxy

- AI orchestration

- caching

- rate limiting

<span id="_Toc224475936" class="anchor"></span>**6. Drive Discovery
Engine**

Drive Discovery — система, которая автоматически запускает рассказы.

<span id="_Toc224475937" class="anchor"></span>**Основной алгоритм**

1.  Пользователь отправляет координаты

2.  Backend определяет кандидатов POI

3.  Система выбирает топ объектов

4.  Рассчитывается ETA

5.  При подходящем ETA запускается рассказ

<span id="_Toc224475938" class="anchor"></span>**Candidate selection**

Используется Google Places Nearby Search.

Кандидаты фильтруются по:

- rating

- popularity

- thematic relevance

<span id="_Toc224475939" class="anchor"></span>**ETA calculation**

Используется Distance Matrix API.

Рассчитывается время прибытия.

<span id="_Toc224475940" class="anchor"></span>**7. AI Guide Brain**

AI Guide Brain — центральный оркестратор системы.

Он принимает решения:

- что рассказать

- когда рассказать

- в каком стиле рассказать.

<span id="_Toc224475941" class="anchor"></span>**Основные компоненты**

Context Engine\
Session Manager\
Persona Manager\
Story Selector\
Narrative Planner\
Conversation Manager\
Safety Governor\
Delivery Orchestrator\
Memory Adapter

<span id="_Toc224475942" class="anchor"></span>**8. City Knowledge
Graph**

City Knowledge Graph — основная база знаний системы.

<span id="_Toc224475943" class="anchor"></span>**Основные сущности**

Places\
Stories\
Events\
People\
Tours\
Creators

<span id="_Toc224475944" class="anchor"></span>**Relationships**

Place ↔ Story\
Story ↔ Event\
Story ↔ Person\
Tour ↔ Place\
User ↔ Place

<span id="_Toc224475945" class="anchor"></span>**Example**

Flatiron Building

Stories\
Architectural story\
Historical story

Events\
1902 construction

People\
Daniel Burnham

<span id="_Toc224475946" class="anchor"></span>**9. Story Generation
Pipeline**

Story generation состоит из нескольких шагов.

<span id="_Toc224475947" class="anchor"></span>**Step 1**

Select POI.

<span id="_Toc224475948" class="anchor"></span>**Step 2**

Retrieve graph context.

<span id="_Toc224475949" class="anchor"></span>**Step 3**

Generate narrative plan.

<span id="_Toc224475950" class="anchor"></span>**Step 4**

Generate story using LLM.

<span id="_Toc224475951" class="anchor"></span>**Step 5**

Generate audio using TTS.

<span id="_Toc224475952" class="anchor"></span>**10. Conversation
System**

Conversation system позволяет пользователю взаимодействовать с гидом.

<span id="_Toc224475953" class="anchor"></span>**Example interactions**

Tell me more\
Why is this important\
Save this place\
Find similar places

<span id="_Toc224475954" class="anchor"></span>**11. Personalization
System**

Система персонализации анализирует поведение пользователя.

<span id="_Toc224475955" class="anchor"></span>**Signals**

Saved places\
Story listening history\
Preferred themes\
Guide preference

<span id="_Toc224475956" class="anchor"></span>**12. Creator Platform
Architecture**

Creators могут создавать собственные туры.

<span id="_Toc224475957" class="anchor"></span>**Creator tools**

Tour builder\
Story editor\
Audio upload

<span id="_Toc224475958" class="anchor"></span>**13. Data Pipelines**

Data sources:

OpenStreetMap\
Wikidata\
Public city data\
Creator content

<span id="_Toc224475959" class="anchor"></span>**14. Storage
Architecture**

Основные хранилища:

PostgreSQL\
Redis\
Object Storage (audio)

<span id="_Toc224475960" class="anchor"></span>**15. API Layer**

Основные эндпоинты:

Drive Discovery\
Narration\
User profile\
History

<span id="_Toc224475961" class="anchor"></span>**16. Caching Strategy**

Redis используется для кэширования:

POI queries\
ETA calculations\
Generated stories

<span id="_Toc224475962" class="anchor"></span>**17. Cost Control
Architecture**

Основные расходы:

Google Maps API\
LLM\
TTS

<span id="_Toc224475963" class="anchor"></span>**Cost mitigation**

Caching\
Story reuse\
Batch requests

<span id="_Toc224475964" class="anchor"></span>**18. Safety and Vehicle
Mode**

Vehicle Mode минимизирует отвлекающие элементы.

<span id="_Toc224475965" class="anchor"></span>**Rules**

No long text\
No complex UI\
Audio first

<span id="_Toc224475966" class="anchor"></span>**19. Scalability Model**

Система масштабируется через:

horizontal backend scaling\
stateless services\
distributed cache

<span id="_Toc224475967" class="anchor"></span>**20. Security and
Privacy**

User data хранится безопасно.

<span id="_Toc224475968" class="anchor"></span>**Privacy controls**

History opt-out\
Delete history\
Minimal data storage

<span id="_Toc224475969" class="anchor"></span>**21. Observability**

Используются:

logging\
metrics\
error monitoring

<span id="_Toc224475970" class="anchor"></span>**22. Deployment
Architecture**

Cloud deployment.

<span id="_Toc224475971" class="anchor"></span>**Components**

Backend services\
Database\
Redis\
Object storage

<span id="_Toc224475972" class="anchor"></span>**23. Future Architecture
Evolution**

Будущие направления развития.

<span id="_Toc224475973" class="anchor"></span>**AR Layer**

AR-экскурсии.

<span id="_Toc224475974" class="anchor"></span>**City Digital Twin**

Модель города.

<span id="_Toc224475975" class="anchor"></span>**AI Companions**

Персональные городские помощники.

<span id="_Toc224475976" class="anchor"></span>**Final Summary**

Hey City architecture объединяет:

City Knowledge Graph\
AI Guide Brain\
Drive Discovery Engine

Это создаёт новую категорию продуктов:

**Conversational City Exploration Platforms**
