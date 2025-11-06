import { GetContractReturnType } from "viem";

import VaultJSON from "./Vault.json";
import DonationJSON from "./Donation.json";

export const VaultABI = VaultJSON.abi;
export const VaultBytecode = VaultJSON.bytecode.object as `0x${string}`;

export const DonationABI = DonationJSON.abi;
export const DonationBytecode = DonationJSON.bytecode.object as `0x${string}`;

export type DonationContract = GetContractReturnType<typeof DonationABI>;
export type VaultContract = GetContractReturnType<typeof VaultABI>;