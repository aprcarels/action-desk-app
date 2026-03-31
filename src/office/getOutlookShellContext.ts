export type OutlookShellContext = {
  itemId: string;
  from: string;
  subject: string;
  customer: string;
  body: string;
};

function getBodyText(): Promise<string> {
  return new Promise((resolve) => {
    const item = window.Office?.context?.mailbox?.item;
    const getAsync = item?.body?.getAsync;

    if (!getAsync) {
      resolve("");
      return;
    }

    getAsync("text", (result) => {
      if (result?.status === "succeeded" && typeof result.value === "string") {
        resolve(result.value);
        return;
      }

      resolve("");
    });
  });
}

export async function getOutlookShellContext(): Promise<OutlookShellContext | null> {
  // This reader is meant to run inside Outlook once Office.js has initialized.
  // During normal browser development, Office is not available, so we return null
  // and let the UI fall back to the existing mock scenario data.
  if (!window.Office?.onReady) {
    return null;
  }

  try {
    await window.Office.onReady();

    const item = window.Office?.context?.mailbox?.item;

    if (!item) {
      return null;
    }

    const itemId = typeof item.itemId === "string" ? item.itemId : "";
    const subject = typeof item.subject === "string" ? item.subject : "";
    const fromAddress = item.from?.emailAddress;
    const fromDisplayName = item.from?.displayName;
    const from = fromAddress || fromDisplayName || "";
    const customer = fromDisplayName || fromAddress || "Unknown customer";
    const body = await getBodyText();

    return {
      itemId,
      from,
      subject,
      customer,
      body,
    };
  } catch {
    return null;
  }
}
