import ExpiryMap from 'expiry-map'
import { v4 as uuidv4 } from 'uuid'
import { GenerateAnswerParams, Provider } from '../types'

async function request(token: string, method: string, path: string, data?: unknown) {
  return fetch(`https://chat.openai.com/backend-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

export async function sendMessageFeedback(token: string, data: unknown) {
  await request(token, 'POST', '/conversation/message_feedback', data)
}

export async function setConversationProperty(
  token: string,
  conversationId: string,
  propertyObject: object,
) {
  await request(token, 'PATCH', `/conversation/${conversationId}`, propertyObject)
}

const KEY_ACCESS_TOKEN = 'accessToken'

const cache = new ExpiryMap(10 * 1000)

export async function getChatGPTAccessToken(): Promise<string> {
  // if (cache.get(KEY_ACCESS_TOKEN)) {
  //   return cache.get(KEY_ACCESS_TOKEN)
  // }
  // const resp = await fetch('https://chat.openai.com/api/auth/session')
  // if (resp.status === 403) {
  //   throw new Error('CLOUDFLARE')
  // }
  // const data = await resp.json().catch(() => ({}))
  // if (!data.accessToken) {
  //   throw new Error('UNAUTHORIZED')
  // }
  // cache.set(KEY_ACCESS_TOKEN, data.accessToken)

  return `data.accessToken`
}

export class ChatGPTProvider implements Provider {
  constructor(private token: string) {
    this.token = token
  }

  private async fetchModels(): Promise<
    { slug: string; title: string; description: string; max_tokens: number }[]
  > {
    const resp = await request(this.token, 'GET', '/models').then((r) => r.json())
    return resp.models
  }

  private async getModelName(): Promise<string> {
    return 'text-davinci-002-render'

    try {
      const models = await this.fetchModels()
      return models[0].slug
    } catch (err) {
      console.error(err)
      return 'text-davinci-002-render'
    }
  }

  async generateAnswer(params: GenerateAnswerParams) {
    let conversationId: string | undefined

    console.log('ChatGPTProvider generateAnswer:', params)

    const cleanup = () => {
      if (conversationId) {
        setConversationProperty(this.token, conversationId, { is_visible: false })
      }
    }

    const modelName = await this.getModelName()
    console.debug('Using model:', modelName)

    const api = `https://api.aioschat.com/`
    // 'https://chat.openai.com/backend-api/conversation'

    const payload = {
      messages: [
        {
          role: 'system',
          content: '请以markdown的形式返回答案',
        },
        {
          role: 'user',
          content: params.prompt,
        },
      ],
      // "tokensLength": 63,
      model: 'gpt-3.5-turbo',
    }

    await fetch(api, {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${this.token}`,
      },

      body: JSON.stringify(payload),
    })
      .then((resp) => resp.json())
      .then(onMessage)
      .finally(() => {
        params.onEvent({ type: 'done' })

        cleanup()
      })

    function onMessage(data: any) {
      console.log('onMessage data', data)

      const text = data.choices?.[0].text
      console.log('text:', text)

      if (text) {
        conversationId = uuidv4()
        params.onEvent({
          type: 'answer',
          data: {
            text,
            messageId: uuidv4(),
            conversationId,
          },
        })
      }
    }

    return { cleanup }
  }
}
