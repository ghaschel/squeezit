FROM debian@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 xz-utils && rm -rf /var/lib/apt/lists/*
COPY receipts /receipts
RUN mkdir -p /opt/runtimes /opt/bun && tar -xJf /receipts/node-v22.13.0-linux-x64.tar.xz -C /opt/runtimes && tar -xJf /receipts/node-v24.22.2-linux-x64.tar.xz -C /opt/runtimes && tar -xzf /receipts/bun-linux-x64-1.4.4.tgz -C /opt/bun --strip-components=1
ENV PATH=/opt/runtimes/node-v24.22.2-linux-x64/bin:/opt/bun/bin:$PATH
WORKDIR /project
COPY project /project
RUN bun --version && node --version && bun ci --production
COPY run-smoke.sh /run-smoke.sh
CMD ["bash", "/run-smoke.sh"]
