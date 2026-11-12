# Статический веб-клиент подбора: отдаётся nginx, бэкенд не нужен.
FROM nginx:1.27-alpine

# конфиг с security-заголовками
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# сама статика приложения
COPY webapp/ /usr/share/nginx/html/

EXPOSE 80
