const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/satguruclinic', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const Lead = require('./models/Lead');
    const leads = await Lead.find({});
    console.log(leads.map(l => ({ fullName: l.fullName, birthdate: l.birthdate })));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
