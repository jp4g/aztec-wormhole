import { createAztecNodeClient, createPXEClient, PXE, waitForPXE } from "@aztec/aztec.js"

export async function bootstrapClients(pxeUrl?: string, nodeUrl?: string) {
    if (!pxeUrl) pxeUrl = "http://localhost:8080";
    if (!nodeUrl) nodeUrl = pxeUrl;
    const pxe = createPXEClient(pxeUrl);
    const node = createAztecNodeClient(nodeUrl);
    await waitForPXE(pxe);
    return { pxe, node };
}

export const wad = (n: bigint = 1n, decimals: bigint = 18n) =>
    n * 10n ** decimals;