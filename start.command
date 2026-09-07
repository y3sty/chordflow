#!/bin/zsh

cd "$(dirname "$0")"
echo "Chordflow запущен: http://localhost:8080"
MAC_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
if [[ -n "$MAC_IP" ]]; then
  echo "Для телефона в той же Wi-Fi сети: http://$MAC_IP:8080"
fi
echo "Чтобы остановить сайт, нажмите Control + C."
python3 -m http.server 8080 --bind 0.0.0.0
