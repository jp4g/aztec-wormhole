// app/api/send-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    // Parse the donation data from request
    let donationData = null;
    try {
      const requestData = await request.json();
      donationData = Object.keys(requestData).length > 0 ? requestData : {};
    } catch {
      donationData = {};
    }

    console.log("1")
    // Check if we have donation data
    const hasData = Object.keys(donationData).length > 0;

    if (!hasData || !donationData.amount) {
      return NextResponse.json({
        success: false,
        error: "No donation amount provided"
      }, { status: 400 });
    }

    // Encode the donation data for safe command line transport
    try {
      console.log("2")
      const encodedData = Buffer.from(JSON.stringify(donationData)).toString('base64');
      
      // Path to your existing script
      const scriptPath = path.join(process.cwd(), '/app/scripts/send-message.mjs');
      
      // Check if the script exists
      if (!fs.existsSync(scriptPath)) {
        console.error(`Script not found at path: ${scriptPath}`);
        return NextResponse.json({
          success: false,
          error: `Script not found at path: ${scriptPath}`
        }, { status: 500 });
      }
      console.log("3")
      
      try {
        // Execute your script with the donation data as an environment variable
        const { stdout, stderr } = await execPromise(`node ${scriptPath}`, {
          timeout: 120000, // 2 minute timeout
          env: {
            ...process.env,
            DONATION_DATA: encodedData
          }
        });
        console.log("4")
        
        if (stderr && !stderr.includes("deprecated in import statements")) {
          console.warn("Script warnings:", stderr);
        }
        
        // Check for different transaction hash formats
        const newTxHashMatch = stdout.match(/hash: Fr<(0x[0-9a-fA-F]+)>/);
        const oldTxHashMatch = stdout.match(/Transaction sent! Hash: (0x[0-9a-fA-F]+)/);
        const anyTxHashMatch = stdout.match(/(0x[0-9a-fA-F]{64})/);
        
        let txHash;
        if (newTxHashMatch && newTxHashMatch[1]) {
          txHash = newTxHashMatch[1];
        } else if (oldTxHashMatch && oldTxHashMatch[1]) {
          txHash = oldTxHashMatch[1];
        } else if (anyTxHashMatch && anyTxHashMatch[1]) {
          txHash = anyTxHashMatch[1];
        }
        
        if (txHash) {
          return NextResponse.json({
            success: true,
            txHash: txHash,
            message: "Donation sent to contract successfully"
          });
        } else {
          // If we can't find a transaction hash but the script completed successfully
          if (stdout.includes("Calling emitter verify_and_publish") &&
              stdout.includes("blockNumber:")) {
            return NextResponse.json({
              success: true,
              message: "Donation sent successfully, but transaction hash could not be extracted",
              rawOutput: stdout.substring(stdout.length - 500)
            });
          }

          console.error("Could not find transaction hash in output");
          return NextResponse.json({
            success: false,
            error: "Could not extract transaction hash from output",
            rawOutput: stdout.substring(stdout.length - 500)
          }, { status: 500 });
        }
      } catch (error) {
        console.error("Error executing script:", error);
        let errorMessage = "Unknown error";
        let errorOutput = "";
        
        if (error instanceof Error) {
          errorMessage = error.message;
          if ('stdout' in error && typeof error.stdout === 'string') {
            errorOutput = error.stdout;
          }
          if ('stderr' in error && typeof error.stderr === 'string') {
            errorOutput += "\n" + error.stderr;
          }
        }
        
        return NextResponse.json({
          success: false,
          error: errorMessage,
          errorOutput: errorOutput || undefined
        }, { status: 500 });
      }
    } catch (jsonError) {
      console.error("Error converting donation data to JSON:", jsonError);
      return NextResponse.json({
        success: false,
        error: `Error converting donation data to JSON: ${jsonError instanceof Error ? jsonError.message : "Unknown error"}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}