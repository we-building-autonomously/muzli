FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o muzli-api .

FROM alpine:3.21

RUN apk add --no-cache sqlite-libs ca-certificates

WORKDIR /app

COPY --from=builder /app/muzli-api .

EXPOSE 8080

CMD ["./muzli-api"]
