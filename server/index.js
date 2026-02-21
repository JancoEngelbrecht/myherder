const app = require('./app')
const { port, isProduction } = require('./config/env')

app.listen(port, () => {
  console.log(`MyHerder server running on port ${port} [${isProduction ? 'production' : 'development'}]`)
})
