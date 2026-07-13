#**Hey City — Story Engine Logic (MVP)**

Version: 1.0

Date: 03-15-2026\
Product: Hey City / Sunshine AI Guide\
Purpose: Define the logic controlling when, how, and what stories are
triggered for the user.

##**1. Основная идея Story Engine**

Story Engine отвечает за три решения:

1️⃣ **Когда запускать историю**\
2️⃣ **О каком объекте рассказывать**\
3️⃣ **Какую именно историю выбрать**

Он соединяет:

User location

\+ movement

\+ POI importance

\+ narrative context

##**2. Основные входные данные**

Story Engine получает данные из четырех источников.

**1️⃣ Location Engine**

{

"lat": 40.7411,

"lng": -73.9897,

"speed_mps": 1.2,

"heading": 180

}

**2️⃣ Nearby POI List**

\[

{

"poi_id": "flatiron",

"distance": 62,

"importance_score": 95

},

{

"poi_id": "metlife",

"distance": 140,

"importance_score": 80

}

\]

**3️⃣ User Context**

{

"mode": "walking",

"theme": "architecture",

"guide": "sophia",

"session_id": "uuid"

}

**4️⃣ Narrative Context**

{

"previous_poi_id": "union_square",

"previous_story_node": "architecture_intro"

}

##**3. Story Trigger Logic**

История запускается только если выполняются условия.

**Condition 1 — Distance Threshold**

distance_to_poi \< trigger_distance

Recommended values:

walking: 80–120 m

driving: 150–300 m

**Condition 2 — Speed Check**

История не запускается если пользователь движется слишком быстро.

walking mode

speed \< 3 m/s

driving mode

speed \< 20 m/s

**Condition 3 — Direction Check**

Direction Check is used primarily for **selecting a new POI**, not for
interrupting an already started story.

When evaluating a candidate POI, the system should prefer landmarks that
lie roughly in the user’s direction of movement.

Example rule:

angle(user_heading, poi_direction) \< 60°

This rule helps reduce irrelevant triggers.

However, once a story has already started, the narration should **not be
interrupted** simply because the user’s heading changes beyond the
threshold.

This is important because in real city movement the user may:

- cross a street

- turn at an intersection

- walk around a building

- temporarily change heading due to GPS jitter

**Story Continuation Rule**

If a story has already started, it remains active unless one of the
following conditions is met:

1.  the user moves clearly away from the POI for a sustained period

2.  the POI becomes irrelevant because the user has entered a new
    narrative zone

3.  the user manually skips the story

4.  a higher-priority POI cluster requires transition

**Suggested continuation tolerance**

Once narration has started:

- heading tolerance may expand significantly

- short-term angle deviations should be ignored

- interruption should be based on **trajectory persistence**, not a
  single angle reading

Example rule:

If story_active = true,\
do not interrupt due to heading change alone.\
Require combined evidence:\
- increasing distance from POI\
- changed route direction\
- timeout window exceeded

**Continuation Grace Window**

After story start, the system should allow a grace window such as:

10–20 seconds

during which heading deviations are ignored.

This prevents accidental interruptions while crossing streets or turning
corners.

**Condition 4 — Story Cooldown**

Чтобы не перегружать пользователя.

minimum_time_between_stories

= 20–40 seconds

##**4. POI Selection Algorithm**

Когда несколько POI рядом, выбирается лучший.

Score формируется так:

score =

importance_score

\+ proximity_score

\+ narrative_relevance

\+ theme_match

**Proximity Score**

distance \< 50m → +40

distance \< 100m → +25

distance \< 150m → +10

**Theme Match**

Если объект соответствует теме пользователя:

+20

**Narrative Relevance**

Если объект логически связан с предыдущим:

+15

**Example**

Flatiron:

importance = 95

distance = 62m

theme_match = true

score = 95 + 25 + 20 = 140

##**5. Story Selection Logic**

Каждый POI содержит **несколько историй**.

Например:

Flatiron Building

stories:

\- architecture_intro

\- construction_story

\- funny_fact

\- urban_legend

Story Engine выбирает:

1\. не повторять предыдущую

2\. соответствовать теме

3\. соответствовать доступному времени

##**6. Story Duration Logic**

Story Engine адаптирует длину.

**Walking**

15–30 sec

**Driving**

8–15 sec

**Quick Fact**

5–8 sec

##**7. Narrative Bridge Logic**

Если пользователь идет между POI.

Story Engine может добавить **bridge stories**.

Example:

"Many early skyscrapers were built in this neighborhood..."

Это создает **непрерывный рассказ**.

##**8. Story Types**

Story Engine работает с типами историй.

**Intro Story**

Первое знакомство.

"This triangular building..."

**Fact Story**

Короткий факт.

**Narrative Story**

История или событие.

**Bridge Story**

Связь между местами.

**Question Response**

Ответ AI гида.

##**9. Story Graph**

Story Graph описывает связи между историями.

Example:

Flatiron_intro

↓

skyscraper_history

↓

MetLife_story

Это позволяет создавать **логичный поток истории города**.

##**10. Anti-Spam Logic**

Чтобы приложение не раздражало.

**Max Stories per Minute**

2

**Repeated POI Block**

same_poi_story_cooldown

= 10 minutes

**Story Priority Reset**

Через:

20 minutes

##**11. Driving Mode Logic**

Driving mode меняет правила.

**Larger detection radius**

300 m

**Shorter stories**

8–12 sec

**Earlier trigger**

История запускается **до приближения к POI**.

##**12. Ask Guide Logic**

Когда пользователь задает вопрос.

Flow:

User question

↓

context collection

↓

POI + theme + previous story

↓

LLM response

↓

TTS audio

##**13. Story Engine Output**

Final output:

{

"story_id": "flatiron_intro",

"poi_id": "flatiron",

"duration_sec": 20,

"text": "The Flatiron Building...",

"audio_url": "...",

"story_node": "architecture_intro"

}

##**14. MVP Simplifications**

Для MVP **не требуется**:

- полный city knowledge graph

- сложные story graphs

- ML ranking

Достаточно:

POI importance

distance

theme

cooldown

##**15. MVP Story Engine Flow**

Полный цикл:

User moves

↓

Discovery Engine detects POI

↓

Story Engine evaluates triggers

↓

Best POI selected

↓

Story generated

↓

Narration Engine

↓

Audio playback

**Итог**

Этот документ определяет **сердце Hey City**.

Он описывает:

- как приложение понимает **где пользователь**

- как выбирает **о чем рассказать**

- как создается **непрерывная история города**

Если хотите, следующий шаг будет **очень мощным**.

Я могу собрать **Hey City Complete MVP Blueprint** —\
единый документ, где будут:

Vision

Architecture

API

UX

User Flow

Story Engine

Data Model

Это фактически **полная спецификация стартапа уровня YC / VC pitch +
engineering handoff**.
