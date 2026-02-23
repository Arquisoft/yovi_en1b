======================================================================
       MONGODB INITIALIZATION AND CONFIGURATION - MICROSERVICES
======================================================================

1. OVERVIEW
-----------
This directory contains the initialization scripts for the MongoDB 
instance. The database is automatically provisioned and configured 
through Docker Compose to ensure a consistent environment.

2. ARCHITECTURAL CHANGES
------------------------
* Added 'mongodb' service to the root docker-compose.yml.
* Created 'init.js' for automated setup of 'app_database' and 
  collections ('users' and 'games').
* Integrated 'mongoose' into 'users-service' for data persistence.
* Configured 'restart: always' policies to handle boot dependencies.

3. OPERATIONAL COMMANDS
-----------------------

[ DEPLOYMENT ]
To build and start the entire infrastructure:
$ docker compose up -d --build

To stop the service:
$ docker compose down

[ DATA VERIFICATION ]
To confirm users are being persisted in the database:
$ docker exec -it mongodb mongosh app_database --eval "db.users.find()"

[ TROUBLESHOOTING ]
To check logs for connection or initialization issues:
$ docker compose logs mongodb
$ docker compose logs users

4. PERSISTENCE NOTE
-------------------
Data is stored in a Docker volume named 'mongo-data'. This ensures 
that the information is not lost even if containers are stopped 
or removed.

======================================================================


