import { sendPushNotification, WebPushError } from '@mmmike/web-push/send'
import { encode } from '@msgpack/msgpack'
import config from '../config'
import { keyToB64 } from './b64'

export async function wptest (subsJSON: string, obj: any) {
    
  const subscription = JSON.parse(subsJSON)
  
  const vapid = { 
    publicKey: config.keys['vapid_public_key'],
    privateKey: config.keys['vapid_private_key'], 
    subject: "mailto:admin@example.com"
  }
  
  try {
    const msg = keyToB64(Buffer.from(encode(obj)))
    const delivered = await sendPushNotification(
      subscription, // PushSubscriptionData from the client
      { title: obj.title, body: msg, url: obj.url },
      vapid,
    )
    if (!delivered) {
      console.log('NOT delivered')
      // 404/410: the subscription is gone. Delete it from your store.
    } else (
      console.log('delivered')
    )
  } catch (err) {
    if (err instanceof WebPushError) {
      // The push service rejected it. `err.statusCode` is its status, and
      // `err.retryAfterMs` is the Retry-After header parsed to milliseconds
      // (`err.retryAfter` keeps it verbatim). Back off, retry.
    } else if (err instanceof TypeError) {
      // `fetch` never reached the push service: DNS, TLS, timeout. Retryable.
    } else {
      // Your input: bad VAPID subject or keys, oversized payload, invalid topic
      // or endpoint. Fix it, don't retry.
    }
  }

}