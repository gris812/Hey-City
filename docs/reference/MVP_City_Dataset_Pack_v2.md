#**🌆 MVP City Dataset Pack — New York (v2)**

**Project:** Sunshine AI Guide / Hey City\
**Version:** 2.0\
**Date:** 2026-03-20\
**Folder:** 03 Product / Content

##**1. Purpose**

Этот документ определяет:

- стартовый набор POI для MVP (New York)

- обновлённую content model (v2)

- роли POI в маршрутах

- story seeds для генерации narration

Документ используется для:

- backend (POI dataset)

- AI Narrative Planning

- Tour generation

- Product/Content QA

##**2. Core Principle**

**Маршрут = не список достопримечательностей, а управляемый опыт.**

Каждый stop выполняет одну из ролей:

- учит (learn)

- показывает (see)

- даёт почувствовать (feel)

- переключает (transition)

##**3. POI Content Model (v2)**

###**3.1 Content Roles**

Каждый POI имеет роль:

- primary_landmark

- secondary_poi

- pause_stop

- viewpoint

- district_anchor

###**3.2 Narrative Weight**

Определяет “нагрузку” истории:

- heavy — ключевая история

- medium — поддерживающая

- light — атмосферная / пауза

###**3.3 Route Functions**

Как используется в маршруте:

- main_stop

- area_intro

- transition

- pause

- photo_moment

- closing_moment

###**3.4 Story Types (MVP)**

- intro

- fact

- narrative

- bridge

- pause_prompt

- viewpoint_prompt

- district_intro

- closing

##**4. POI Dataset (Downtown / Financial District)**

###**1. Wall Street**

- content_role: primary_landmark

- importance: 10

- narrative_weight: heavy

- themes: finance, history, power

story_seed:\
“Once protected by a wooden wall, this street grew into the symbolic
center of global finance.”

###**2. New York Stock Exchange**

- content_role: primary_landmark

- importance: 10

- narrative_weight: heavy

- themes: finance, economy

story_seed:\
“Behind these columns, trillions move daily — but trading here began
under a tree.”

###**3. Federal Hall**

- content_role: secondary_poi

- importance: 9

- narrative_weight: medium

- themes: politics, history

story_seed:\
“This is where George Washington became the first President of the
United States.”

###**4. Charging Bull**

- content_role: secondary_poi

- importance: 9

- narrative_weight: medium

- themes: symbolism, urban legend

story_seed:\
“Installed overnight without permission, this bull became a global
symbol of market optimism.”

###**5. Trinity Church**

- content_role: secondary_poi

- importance: 8

- narrative_weight: medium

- themes: religion, architecture

story_seed:\
“Once the tallest building in the city, this church now stands quietly
among skyscrapers.”

###**6. 9/11 Memorial**

- content_role: primary_landmark

- importance: 10

- narrative_weight: heavy

- themes: memory, tragedy

story_seed:\
“These voids mark absence — a space where presence once defined the
skyline.”

###**7. One World Trade Center**

- content_role: primary_landmark

- importance: 10

- narrative_weight: heavy

- themes: resilience, architecture

story_seed:\
“Rising to 1,776 feet, this tower encodes a national symbol into its
height.”

###**8. Oculus**

- content_role: secondary_poi

- importance: 7

- narrative_weight: medium

- themes: architecture, modern design

story_seed:\
“Designed as a bird in flight, this structure blends transportation with
sculpture.”

###**9. Battery Park**

- content_role: district_anchor

- importance: 8

- narrative_weight: medium

- themes: immigration, harbor

story_seed:\
“From here, millions first saw America as they arrived by ship into New
York Harbor.”

###**10. Battery Park City Waterfront Promenade**

- content_role: pause_stop

- importance: 6

- narrative_weight: light

- route_functions: pause, photo_moment

themes: waterfront, skyline, reflection

story_seed:\
“A calmer edge of Manhattan where river light and open sky soften the
intensity of Downtown.”

###**11. Staten Island Ferry Terminal**

- content_role: viewpoint

- importance: 7

- narrative_weight: light

- route_functions: viewpoint, photo_moment

themes: transport, skyline

story_seed:\
“One of the best free views of the Statue of Liberty — used daily by
commuters.”

##**5. Demo Routes (v2)**

###**Route 1 — Financial District Core**

Stops:

1.  Wall Street (main)

2.  NYSE (main)

3.  Charging Bull (secondary)

4.  Federal Hall (secondary)

5.  Trinity Church (transition)

6.  9/11 Memorial (main)

7.  Oculus (transition)

8.  Waterfront Promenade (pause)

9.  One World Trade Center (main)

###**Route 2 — Brooklyn Bridge**

Stops:

1.  City Hall (anchor)

2.  Brooklyn Bridge (main)

3.  Midpoint (viewpoint)

4.  DUMBO (viewpoint/pause)

###**Route 3 — Chinatown → Little Italy**

Stops:

1.  Chinatown Gate (anchor)

2.  Mott Street (secondary)

3.  Columbus Park (pause)

4.  Mulberry Street (secondary)

5.  Little Italy (anchor)

###**Route 4 — Battery & Waterfront**

Stops:

1.  Battery Park (anchor)

2.  Castle Clinton (secondary)

3.  Harbor View (viewpoint)

4.  Waterfront Promenade (pause)

5.  Ferry Terminal (viewpoint)

###**Route 5 — Modern NYC / Resilience**

Stops:

1.  Oculus (secondary)

2.  9/11 Memorial (main)

3.  One World Trade Center (main)

###**6. Key Content Rules**

1.  Не каждый stop должен быть “историей”

2.  Pause stops = часть UX, не filler

3.  Narrative weight должен чередоваться

4.  Heavy stories нельзя ставить подряд более 2

5.  Viewpoints усиливают эмоциональный эффект

##**7. Final Statement**

**Hey City routes are not sequences of landmarks.\
They are paced narrative experiences.**
