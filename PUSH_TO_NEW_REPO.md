# Пуш в новый репозиторий

Выполните в терминале из папки **Sunshine-AI-Guide** (или **sunshine-ai-guide**):

```bash
# 1. Убедиться, что вы в корне проекта
pwd   # должен быть .../Sunshine-AI-Guide или .../sunshine-ai-guide

# 2. Инициализация (если ещё не делали)
git init

# 3. Добавить все файлы
git add .

# 4. Проверить: есть ли что коммитить
git status

# 5. Первый коммит (обязательно — без него ветки main не будет)
git commit -m "Initial: Sunshine AI Guide (backend + mobile, Google Maps)"

# 6. Переименовать ветку в main (если по умолчанию создалась master)
git branch -M main

# 7. Подключить удалённый репозиторий
git remote add origin https://github.com/gris812/Sunshine-AI-Guide.git
# Если remote уже был добавлен ранее: git remote set-url origin https://github.com/gris812/Sunshine-AI-Guide.git

# 8. Пуш
git push -u origin main
```

Если ошибка **"src refspec main does not match any"**:
- Сделайте шаги 4 и 5 — без коммита ветки `main` нет.
- После `git commit` снова выполните `git branch -M main`, затем `git push -u origin main`.

Файл `mobile/.env` с ключами в коммит не попадёт (он в .gitignore).
