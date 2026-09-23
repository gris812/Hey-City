# M1 production environment migration

Run this once on the VPS before deploying M1. It changes only model selection and internal cost
accounting; it does not expose or rotate `OPENAI_API_KEY`.

```bash
cd /opt/HeyCity-production
cp .env.production .env.production.pre-m1
sed -i \
  -e 's/^OPENAI_TEXT_MODEL=.*/OPENAI_TEXT_MODEL=gpt-5.6-luna/' \
  -e 's/^OPENAI_TEXT_INPUT_USD_PER_MILLION=.*/OPENAI_TEXT_INPUT_USD_PER_MILLION=0.20/' \
  -e 's/^OPENAI_TEXT_OUTPUT_USD_PER_MILLION=.*/OPENAI_TEXT_OUTPUT_USD_PER_MILLION=1.20/' \
  -e 's/^DISCOVERY_KNOWLEDGE_TIMEOUT_MS=.*/DISCOVERY_KNOWLEDGE_TIMEOUT_MS=10000/' \
  .env.production
docker compose --project-name heycity-production --env-file .env.production \
  -f docker-compose.production.yml up -d --build --no-deps api
```

Verify the API, then retain the backup until the deployment has passed field QA:

```bash
curl -fsS https://api.heycity.stolbergco.com/health
```

For a deliberately different text model, set both cost variables to that model's current list prices;
the dashboard is an estimate and must not silently retain Luna rates.
