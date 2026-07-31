// react-email template: "someone signed up and needs approving", sent to the
// portal admins when a new Google sign-in could not be matched to a Shareholder
// by email. Rendered/sent by lib/portal/signupNotification.ts.
//
// One recipient is an SMS gateway (a @vtext.net address), which renders text
// only and truncates hard — so the admin URL comes first, in plain text, before
// any of the prose.

import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'

export function NewSignupNotification(props: {
  signupName: string
  signupEmail: string
  adminUrl: string
}) {
  const { signupName, signupEmail, adminUrl } = props
  return (
    <Html>
      <Head />
      <Preview>
        {signupName} signed up and is waiting for approval — {adminUrl}
      </Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">New signup awaiting approval</Heading>
          <Text style={{ margin: '4px 0' }}>{adminUrl}</Text>
          <Text style={{ margin: '12px 0 4px' }}>
            <strong>{signupName}</strong> ({signupEmail}) just signed in for the first time.
          </Text>
          <Text style={{ margin: '4px 0' }}>
            No shareholder record matched their email, so they are waiting for an admin to approve
            them.
          </Text>
          <Text style={{ margin: '12px 0 4px' }}>
            <Link href={adminUrl}>Review in User Management</Link>
          </Text>
          <Text style={{ color: '#666', fontSize: '12px' }}>
            If they should also be tied to a shareholder record, link them from Accounting → Admin →
            Shareholders.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default NewSignupNotification
