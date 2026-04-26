# YOVI Load Testing Suite

This repository contains the performance and load testing suite for the YOVI application, built with [Artillery](https://www.artillery.io/). It is designed to simulate concurrent user traffic (Registration, Authentication, and Gameplay) to identify bottlenecks and ensure system stability under high load.

## Local Execution

To run the load tests against your local development environment:

1. Ensure your local Docker stack is fully operational:
   ```bash
   docker compose up -d
   ```
2. Install the necessary dependencies (first-time only):
   ```bash
   npm install
   ```
3. Execute the local test scenario. This targets the local API directly (`http://localhost:3000`):
   ```bash
   npx artillery run -e local scenario-flow.yml
   ```

## Production Execution (CI/CD)

Running load tests from a local machine against a production server can yield inaccurate results due to local bandwidth limitations. For professional load testing, this suite is integrated into GitHub Actions to execute the attack from cloud infrastructure.

To run the test against Production:
1. Navigate to the **Actions** tab in your GitHub repository.
2. Select the **Load Testing (Production)** workflow.
3. Click **Run workflow**.

*Note: The GitHub runner will automatically inject the `DEPLOY_DOMAIN` secret and target your production API. You can monitor the performance impact in real-time through your Grafana Observability Dashboard.*
