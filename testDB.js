const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect('mongodb://127.0.0.1:27017/satguruclinic', {
}).then(async () => {
  const users = await User.find({}, 'name role adminId');
  console.log(users);
  process.exit(0);
});
