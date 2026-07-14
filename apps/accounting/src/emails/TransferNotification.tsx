import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export function TransferNotification(props: {
  recipientName: string;
  direction: "sent" | "received";
  counterpartyName: string;
  amount: string;
  description: string;
  date: string;
  adminName: string;
  inboxUrl: string;
}) {
  const {
    recipientName,
    direction,
    counterpartyName,
    amount,
    description,
    date,
    adminName,
    inboxUrl,
  } = props;
  return (
    <Html>
      <Head />
      <Preview>
        A transfer of {amount} {direction === "sent" ? "to" : "from"} {counterpartyName} was
        recorded
      </Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "24px",
            borderRadius: "8px",
            maxWidth: "480px",
          }}
        >
          <Heading as="h2">Share transfer recorded</Heading>
          <Text>Hi {recipientName},</Text>
          <Text>
            {adminName} recorded a transfer of <strong>{amount}</strong> shares{" "}
            {direction === "sent"
              ? `from you to ${counterpartyName}`
              : `from ${counterpartyName} to you`}{" "}
            on {date}. This has already been applied to your share balance.
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

export default TransferNotification;
