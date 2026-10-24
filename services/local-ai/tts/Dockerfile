# MODE=mock builds a tiny image that needs no model. MODE=models installs the real model stack.
FROM python:3.12-slim
ARG MODE=mock
ENV AI_MODE=${MODE} PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/models/hf PIPER_DATA=/models/piper

RUN useradd --create-home --uid 10001 app && mkdir -p /models && chown app /models
WORKDIR /app
COPY requirements.txt requirements.models.txt ./
RUN pip install -r requirements.txt && if [ "$MODE" = "models" ]; then pip install -r requirements.models.txt; fi
COPY app.py .
USER app
EXPOSE 8766
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8766"]
