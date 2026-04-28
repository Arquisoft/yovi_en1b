module.exports = {
  generateUserData: (context, events, done) => {
    context.vars.username = "loadtest_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    context.vars.password = "pass12345";
    return done();
  }
};
