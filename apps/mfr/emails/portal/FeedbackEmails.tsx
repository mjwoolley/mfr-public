// react-email templates for CAP-048 Member Feedback. Member emails carry the
// Jira issue key and the original message but never a Jira link (members are
// not expected to use Jira); their Reply-To routes replies back to the issue.
// Admin emails link to the issue and reply straight to the member.

import type { ReactNode } from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'

const quoteStyle = {
  margin: '8px 0',
  padding: '8px 12px',
  borderLeft: '3px solid #ccc',
  whiteSpace: 'pre-wrap' as const,
}

function Frame(props: { preview: string; heading: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '520px',
          }}
        >
          <Heading as="h2">{props.heading}</Heading>
          {props.children}
        </Container>
      </Body>
    </Html>
  )
}

function ReplyHint() {
  return (
    <Text style={{ color: '#666', fontSize: '12px' }}>
      Reply to this email to add to your Feedback. Your reply goes to the site admins.
    </Text>
  )
}

export function FeedbackReceived(props: { issueKey: string; message: string }) {
  return (
    <Frame
      preview={`We received your Feedback (${props.issueKey})`}
      heading="Thanks for your Feedback"
    >
      <Text>
        The site admins received your Feedback. Its reference is <strong>{props.issueKey}</strong>.
        We&apos;ll email you when its status changes.
      </Text>
      <Text style={{ margin: '12px 0 0' }}>Your message:</Text>
      <Text style={quoteStyle}>{props.message}</Text>
      <ReplyHint />
    </Frame>
  )
}

export function FeedbackStatusUpdate(props: {
  issueKey: string
  message: string
  status: string
  resolutionNote: string | null
}) {
  const done = props.status.trim().toLowerCase() === 'done'
  return (
    <Frame
      preview={`Your Feedback ${props.issueKey} is now ${props.status}`}
      heading={done ? 'Your Feedback is done' : 'Your Feedback was updated'}
    >
      <Text>
        Your Feedback <strong>{props.issueKey}</strong> is now <strong>{props.status}</strong>.
      </Text>
      {done && props.resolutionNote && (
        <>
          <Text style={{ margin: '12px 0 0' }}>Resolution note:</Text>
          <Text style={quoteStyle}>{props.resolutionNote}</Text>
        </>
      )}
      <Text style={{ margin: '12px 0 0' }}>Your original message:</Text>
      <Text style={quoteStyle}>{props.message}</Text>
      <ReplyHint />
    </Frame>
  )
}

export function FeedbackAdminNotification(props: {
  issueKey: string
  issueUrl: string | null
  memberName: string
  memberEmail: string
  pagePath: string
  message: string
}) {
  return (
    <Frame
      preview={`New Feedback from ${props.memberName} (${props.issueKey})`}
      heading="New member Feedback"
    >
      <Text>
        <strong>{props.memberName}</strong> ({props.memberEmail}) sent Feedback from{' '}
        {props.pagePath}.
      </Text>
      <Text style={quoteStyle}>{props.message}</Text>
      <Text>
        {props.issueUrl ? (
          <Link href={props.issueUrl}>Open {props.issueKey} in Jira</Link>
        ) : (
          <>Jira issue {props.issueKey}</>
        )}
      </Text>
      <Text style={{ color: '#666', fontSize: '12px' }}>
        Reply to this email to answer the member directly.
      </Text>
    </Frame>
  )
}

export function FeedbackReplyForward(props: {
  issueKey: string
  memberName: string
  memberEmail: string
  reply: string
  deliveryId: string
  jiraDelivered: boolean
}) {
  return (
    <Frame
      preview={`${props.memberName} replied on ${props.issueKey}`}
      heading="Member reply to Feedback"
    >
      <Text>
        <strong>{props.memberName}</strong> ({props.memberEmail}) replied on Feedback{' '}
        <strong>{props.issueKey}</strong>:
      </Text>
      <Text style={quoteStyle}>{props.reply}</Text>
      <Text style={{ color: '#666', fontSize: '12px' }}>
        Reply to this email to answer the member directly.{' '}
        {props.jiraDelivered
          ? `The reply was also added to ${props.issueKey} in Jira.`
          : `Adding the reply to ${props.issueKey} in Jira failed — please add it as a comment by hand.`}{' '}
        Delivery {props.deliveryId}.
      </Text>
    </Frame>
  )
}
