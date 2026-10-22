
import { exit } from 'process'
import Log from './fw/log'
import config from './config'
import { setup } from './config2'

// import { wptest } from './fw/wptest'

Log.info('Hello via Bun!')

/*
setTimeout(async () => {
  const subsJSON = '{"endpoint":"https://fcm.googleapis.com/fcm/send/dbaY34lmmLs:APA91bFyM4WyZ2K-HA4XBcDpZQ7By1SjF8__3HPFscJ76xAFHB0w9sLwAdP26VS0869Yy2NErN_No-9iWxXVY_KPWDfgGdEZ-6e2iiA7mAGHX05OAmUjlL5HuR18bmdspGJe8R5KpqFu","expirationTime":null,"keys":{"p256dh":"BL4EDO3M_6RbJZpR8zDxgLoYEbhTovv2CucWQZZVNDRf7Bo_ORBdKCHfmIEQ0D3cHxWsYPhp70YpFgRoEi9McpY","auth":"rLeRmm17W0frie8wpjwjtQ"}}'
  const obj = {
      body: 'DEPUIS bun !',
      title: 'Bonjour !',
      url: 'example.com'
    }
  await wptest(subsJSON, obj)
}, 1)
*/
setup()
setTimeout(() => {
  exit()
}, 30000)
