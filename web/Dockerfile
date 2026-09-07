FROM nginx:1.27-alpine
ARG HEY_CITY_API_URL=https://api.heycity.stolbergco.com
ARG GOOGLE_MAPS_BROWSER_KEY
COPY web /usr/share/nginx/html
COPY ops/nginx-web.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s|http://localhost:4000|${HEY_CITY_API_URL}|g; s|googleMapsBrowserKey: ''|googleMapsBrowserKey: '${GOOGLE_MAPS_BROWSER_KEY}'|g" /usr/share/nginx/html/config.js
EXPOSE 80
