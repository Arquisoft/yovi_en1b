db = db.getSiblingDB('app_database');

db.createCollection('users');
db.createCollection('games');

db.users.insertOne({ username: "admin_test", createdAt: new Date() });
