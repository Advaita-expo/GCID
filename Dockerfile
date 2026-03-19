# Dockerfile for GCID
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY gcid/requirements.txt ./gcid/requirements.txt
RUN pip install --no-cache-dir -r gcid/requirements.txt
COPY . .
ENV PORT=5000
EXPOSE 5000
CMD ["python", "gcid/app.py"]
