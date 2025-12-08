import { TestWallet } from "@aztec/test-wallet/server";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import accounts from "../data/accounts.json";
import addresses from "../data/addresses.json";
import { Fr } from "@aztec/foundation/fields";
import { AztecNode } from "@aztec/aztec.js/node";
import type { PXEConfig } from "@aztec/pxe/config"
import { isTestnet } from "../../ts/src/utils";


type AccountData = {
  secretKey: string;
  salt: string;
}

export type ContractAddressData = {
  receiver: string;
  wormhole: string;
  token: string;
  bridge?: string;
}

export const getAccounts = async (
  node: AztecNode,
  pxeConfig: Partial<PXEConfig> = {}
): Promise<{
  wallet: TestWallet,
  addresses: AztecAddress[]
}> => {
  // check if testnet
  let wallet = await TestWallet.create(node, pxeConfig);
  let addresses = [];
  if (await isTestnet(node)) {
    // if testnet, get accounts from env (should run setup_accounts.ts first)
    addresses = await getAccountsFromFs(wallet);
  } else {
    // if sandbox, get initialized test accounts
    const accounts = await getInitialTestAccountsData();
    for (const account of accounts) {
      await wallet.createSchnorrAccount(account.secret, account.salt);
      addresses.push(account.address);
      await wallet.registerSender(account.address);
    }
  }

  return { wallet, addresses };
}

export const getAddressesFromFs = async (): Promise<
  { [chainId: string]: ContractAddressData }
> => {
  // read addresses from file
  return addresses as { [chainId: string]: ContractAddressData };
}

export const getAccountsFromFs = async (
  wallet: TestWallet
): Promise<AztecAddress[]> => {
  // reinstantiate the accounts
  const addresses = [];
  for (const account of accounts as AccountData[]) {
    const secretKey = Fr.fromString(account.secretKey);
    const salt = Fr.fromString(account.salt);
    const manager = await wallet.createSchnorrAccount(secretKey, salt);
    addresses.push(manager.address);
  }
  return addresses;
}