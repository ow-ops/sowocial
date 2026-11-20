# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# SecretsUsedInArgOrEnv flags SCCACHE_S3_KEY_PREFIX, a bucket path.

FROM rust:1-slim-trixie AS build
ARG TARGETARCH
ARG SCCACHE_VERSION=0.18.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in \
         amd64) arch=x86_64 sha=45f1447fbe231e3037bde351ef70677dd212216c8d62ae7ca409fecc4d6acc89 ;; \
         arm64) arch=aarch64 sha=2b3284d5da3b46a47dc4229e75bb7b88ac4aa99c8d754fb7d2f84997e5a4354a ;; \
         *) echo "unsupported Docker architecture: $TARGETARCH" >&2; exit 1 ;; \
       esac \
    && name="sccache-v$SCCACHE_VERSION-$arch-unknown-linux-musl" \
    && curl -fsSLo /tmp/sccache.tar.gz "https://github.com/mozilla/sccache/releases/download/v$SCCACHE_VERSION/$name.tar.gz" \
    && echo "$sha  /tmp/sccache.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/sccache.tar.gz -C /usr/local/bin --strip-components=1 "$name/sccache" \
    && rm /tmp/sccache.tar.gz
# Set by CI along with the aws_access_key_id and aws_secret_access_key secrets.
ARG SCCACHE_BUCKET=
ARG SCCACHE_ENDPOINT=
ARG SCCACHE_REGION=
ARG SCCACHE_S3_KEY_PREFIX=
ARG SCCACHE_S3_USE_SSL=
ENV CARGO_INCREMENTAL=0 \
    SCCACHE_BUCKET=$SCCACHE_BUCKET \
    SCCACHE_ENDPOINT=$SCCACHE_ENDPOINT \
    SCCACHE_REGION=$SCCACHE_REGION \
    SCCACHE_S3_KEY_PREFIX=$SCCACHE_S3_KEY_PREFIX \
    SCCACHE_S3_USE_SSL=$SCCACHE_S3_USE_SSL
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=secret,id=aws_access_key_id,env=AWS_ACCESS_KEY_ID \
    --mount=type=secret,id=aws_secret_access_key,env=AWS_SECRET_ACCESS_KEY \
    if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$SCCACHE_BUCKET" ]; then export RUSTC_WRAPPER=sccache; fi \
    && cargo build --release --locked

FROM debian:trixie-slim
# rustls verifies Google's certificates against the system roots.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/sowocial-push-relay /usr/local/bin/
USER nobody
ENV BIND=0.0.0.0:8080
EXPOSE 8080
CMD ["sowocial-push-relay"]
