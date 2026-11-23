FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal

RUN dnf install -y ca-certificates \
    && case "$(uname -m)" in \
        x86_64) package="aws-emulator-x86_64.rpm" ;; \
        aarch64) package="aws-emulator-aarch64.rpm" ;; \
        *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;; \
    esac \
    && curl -fL "https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/${package}" -o /tmp/aws-emulator.rpm \
    && rpm -i /tmp/aws-emulator.rpm \
    && rm -f /tmp/aws-emulator.rpm \
    && mkdir -p /home/emulator \
    && chown 1000 /home/emulator

USER 1000
ENV HOME=/home/emulator
ENV EMULATOR_BIND_ADDRESS=0.0.0.0
ENV EMULATOR_TELEMETRY=off

ENTRYPOINT ["aws-emulator"]
