# syntax=docker/dockerfile:1

# Stage 1: Build do Frontend React / Vite
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# Copia manifestos do monorepo para cache de dependências
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY remotion-kit/package.json ./remotion-kit/
COPY runner/package.json ./runner/

RUN npm ci

# Copia código do frontend e pacotes dependentes
COPY frontend/ ./frontend/
COPY remotion-kit/ ./remotion-kit/

# Executa o build da SPA estática
RUN npm run build -w frontend

# Stage 2: Build do Backend Go
FROM golang:alpine AS backend-builder
ENV GOTOOLCHAIN=auto
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bin/api ./cmd/api

# Stage 3: Imagem Final de Runtime
FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copia o binário Go e a SPA compilada
COPY --from=backend-builder /bin/api /app/api
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Cria diretório de dados persistente
RUN mkdir -p /data

ENV PORT=8080
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/dist

EXPOSE 8080

ENTRYPOINT ["/app/api"]
