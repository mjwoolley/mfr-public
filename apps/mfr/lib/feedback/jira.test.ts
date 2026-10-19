import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JiraError,
  addDeliveryComment,
  createFeedbackIssue,
  getFeedbackIssue,
  issueBrowseUrl,
  latestCommentText,
  listComments,
  resetJiraCache,
} from './jira'

const config = {
  cloudId: 'cloud-1',
  projectKey: 'KAN',
  issueType: 'Task',
  label: 'mfr-feedback',
  clientId: 'id',
  clientSecret: 'secret',
  creatorAccountId: 'bot',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const token = () => json({ access_token: 'tok', expires_in: 3600 })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetJiraCache()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('Jira client', () => {
  it('exchanges client credentials once and reuses the token', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ key: 'KAN-1' }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await createFeedbackIssue(config, {
      summary: 's',
      description: { type: 'doc', version: 1, content: [] },
      feedback: { memberEmail: 'a@x.org', memberName: 'A', message: 'm' },
    })
    await addDeliveryComment(config, 'KAN-1', { type: 'doc', version: 1, content: [] }, 'd1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://auth.atlassian.com/oauth/token')
    expect(JSON.parse(tokenInit.body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'id',
      client_secret: 'secret',
    })
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/issue',
    )
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer tok')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).properties).toEqual([
      { key: 'mfr-feedback-delivery', value: { deliveryId: 'd1' } },
    ])
  })

  it('surfaces token and API failures as JiraError', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    await expect(getFeedbackIssue(config, 'KAN-1')).rejects.toMatchObject({
      name: 'JiraError',
      status: 401,
    })
    fetchMock.mockResolvedValueOnce(json({}))
    await expect(getFeedbackIssue(config, 'KAN-1')).rejects.toThrow('no access_token')
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json({}, 201))
    await expect(
      createFeedbackIssue(config, {
        summary: 's',
        description: { type: 'doc', version: 1, content: [] },
        feedback: { memberEmail: 'a', memberName: '', message: 'm' },
      }),
    ).rejects.toBeInstanceOf(JiraError)
  })

  it('treats a missing issue as null and normalizes the Feedback property', async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json({}, 404))
    expect(await getFeedbackIssue(config, 'KAN-9')).toBeNull()
    fetchMock.mockResolvedValueOnce(
      json({
        key: 'KAN-2',
        fields: {},
        properties: { 'mfr-feedback': { memberEmail: ' Ann@X.org ', message: 'hi' } },
      }),
    )
    expect(await getFeedbackIssue(config, 'KAN-2')).toEqual({
      key: 'KAN-2',
      projectKey: '',
      labels: [],
      creatorAccountId: null,
      status: '',
      feedback: { memberEmail: 'ann@x.org', memberName: '', message: 'hi' },
    })
    fetchMock.mockResolvedValueOnce(json({ key: 'KAN-3', properties: { 'mfr-feedback': 'junk' } }))
    expect((await getFeedbackIssue(config, 'KAN-3'))?.feedback).toBeNull()
    fetchMock.mockResolvedValueOnce(json({}, 500))
    await expect(getFeedbackIssue(config, 'KAN-4')).rejects.toMatchObject({ status: 500 })
  })

  it('pages through comments and reads delivery ids', async () => {
    const c = (id: string, deliveryId?: string) => ({
      id,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `c${id}` }] }],
      },
      properties: deliveryId ? [{ key: 'mfr-feedback-delivery', value: { deliveryId } }] : [],
    })
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ comments: [c('1', 'd1')], total: 2 }))
      .mockResolvedValueOnce(json({ comments: [c('2')], total: 2 }))
    expect(await listComments(config, 'KAN-1')).toEqual([
      { id: '1', text: 'c1', deliveryId: 'd1' },
      { id: '2', text: 'c2', deliveryId: null },
    ])
    fetchMock.mockResolvedValueOnce(json({}))
    expect(await listComments(config, 'KAN-1')).toEqual([])
  })

  it('reads the latest comment text, or null', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        json({
          comments: [
            {
              id: '9',
              body: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixed' }] }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ comments: [] }))
    expect(await latestCommentText(config, 'KAN-1')).toBe('Fixed')
    expect(await latestCommentText(config, 'KAN-1')).toBeNull()
  })

  it('builds the browse URL from serverInfo, caching it, and tolerates failure', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ baseUrl: 'https://mfr.atlassian.net/' }))
    expect(await issueBrowseUrl(config, 'KAN-1')).toBe('https://mfr.atlassian.net/browse/KAN-1')
    expect(await issueBrowseUrl(config, 'KAN-2')).toBe('https://mfr.atlassian.net/browse/KAN-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resetJiraCache()
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json({}))
    expect(await issueBrowseUrl(config, 'KAN-1')).toBeNull()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await issueBrowseUrl(config, 'KAN-1')).toBeNull()
  })
})
