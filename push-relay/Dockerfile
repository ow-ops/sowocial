FROM rust:1-slim-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:trixie-slim
# rustls verifies Expo's certificate against the system roots.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/sowocial-push-relay /usr/local/bin/
USER nobody
ENV BIND=0.0.0.0:8080
EXPOSE 8080
CMD ["sowocial-push-relay"]
