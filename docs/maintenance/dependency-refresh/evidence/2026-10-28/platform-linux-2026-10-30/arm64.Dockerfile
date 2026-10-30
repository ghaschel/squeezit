FROM debian@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake pkg-config zlib1g-dev libjpeg-dev libssl-dev poppler-utils fonts-dejavu-core file openssl ca-certificates xz-utils git && rm -rf /var/lib/apt/lists/*
COPY receipts /receipts
RUN echo '547cee67de77b5c4ef4917e57d2db9c848cfe3aa950361f68d36367a3a03936e  /receipts/qpdf-11.3.0.tar.gz' | sha256sum --check && echo '8a58af5b6141319287c1883bec8bd1bd545b7567b7fc5e6ce5d25a1c85f36397  /receipts/qpdf-12.4.2.tar.gz' | sha256sum --check
RUN mkdir -p /opt/runtimes && tar -xJf /receipts/node-v22.13.0-linux-arm64.tar.xz -C /opt/runtimes && tar -xJf /receipts/node-v24.22.2-linux-arm64.tar.xz -C /opt/runtimes && mkdir -p /opt/bun && tar -xzf /receipts/bun-linux-aarch64-1.4.4.tgz -C /opt/bun --strip-components=1
ENV PATH=/opt/runtimes/node-v24.22.2-linux-arm64/bin:/opt/bun/bin:$PATH
RUN for version in 11.3.0 12.4.2; do tar -xzf "/receipts/qpdf-$version.tar.gz" -C /tmp && cmake -S "/tmp/qpdf-$version" -B "/tmp/qpdf-$version-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="/opt/qpdf-$version" -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_INSTALL_RPATH="/opt/qpdf-$version/lib" -DBUILD_TESTING=OFF && cmake --build "/tmp/qpdf-$version-build" --parallel 4 && cmake --install "/tmp/qpdf-$version-build" && rm -rf "/tmp/qpdf-$version" "/tmp/qpdf-$version-build"; done
WORKDIR /project
COPY project /project
RUN bun --version && node --version && bun ci
COPY run-validation.sh /run-validation.sh
CMD ["bash", "/run-validation.sh"]
