FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

COPY . /app

ARG VITE_API_BASE_URL=http://127.0.0.1:8000
ARG VITE_FIREBASE_API_KEY=AIzaSyD3ampGOzCBzJOEeBDOyLy6UJWD-AlvQiM
ARG VITE_FIREBASE_AUTH_DOMAIN=story-476305.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=story-476305
ARG VITE_FIREBASE_STORAGE_BUCKET=story-476305.firebasestorage.app
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=429898616977
ARG VITE_FIREBASE_APP_ID=1:429898616977:web:177a3bfda0fd85a3926f30

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET} \
    VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV PORT=8080

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
