import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

export function CorrectionNotification(props: {
  shareholderName: string;
  amount: string;
  description: string;
  originalType: string;
  date: string;
  adminName: string;
  inboxUrl: string;
}) {
  const { shareholderName, amount, description, originalType, date, adminName, inboxUrl } = props;
  return (
    <Html>
      <Head />
      <Preview>A correction of {amount} was recorded for you</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container
          style={{ backgroundColor: "#ffffff", padding: "24px", borderRadius: "8px", maxWidth: "480px" }}
        >
          <Heading as="h2">Correction recorded</Heading>
          <Text>Hi {shareholderName},</Text>
          <Text>
            {adminName} recorded a correction of <strong>{amount}</strong> shares to your balance on{" "}
            {date}, correcting an earlier {originalType.toLowerCase()} entry. This has already been
            applied.
          </Text>
          <Text>
            <strong>Reason:</strong> {description}
          </Text>
          <Section>
            <Link href={inboxUrl}>Review and acknowledge in your inbox</Link>
          </Section>
          <Text style={{ color: "#666", fontSize: "12px" }}>
            If this doesn&apos;t look right, just reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CorrectionNotification;
