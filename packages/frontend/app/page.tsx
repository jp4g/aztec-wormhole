"use client"
import { useEffect, useRef, useState } from "react"

export default function Home() {
  // State variables
  const [donationAmount, setDonationAmount] = useState<number | "">("")
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null)
  const [txHash, setTxHash] = useState("")
  const [txStatus, setTxStatus] = useState("")
  const [receivedDonation, setReceivedDonation] = useState<number | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // Refs
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Clean up polling interval on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Submit donation directly without verification
  const submitDonation = async () => {
    // Validate donation amount
    if (!donationAmount || donationAmount <= 0 || donationAmount > 254) {
      setError("Please enter a valid donation amount between 1 and 254")
      return
    }

    // Lock the donation amount
    const lockedAmount = Number(donationAmount)
    setSubmittedAmount(lockedAmount)

    // Reset state
    setTxHash("")
    setTxStatus("")
    setReceivedDonation(null)
    setIsPolling(false)
    setError("")

    try {
      setIsLoading(true)
      setTxStatus(`Processing your donation of ${lockedAmount} tokens...`)

      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: lockedAmount })
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setTxStatus(`Your donation of ${lockedAmount} tokens has been submitted!`)
        setTxHash(data.txHash)
        // Start polling automatically once we have a txHash
        startPollingDonation(data.txHash)
      } else {
        setTxStatus(`Error: ${data.error}`)
      }

      setIsLoading(false)
    } catch (error) {
      console.error("Error sending donation to API:", error)
      setTxStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
      setError("Failed to submit donation")
      setIsLoading(false)
      setSubmittedAmount(null)
    }
  }

  // Function to start polling for the donation confirmation using txHash
  const startPollingDonation = (currentTxHash?: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    // Use the passed txHash or fall back to state
    const hashToUse = currentTxHash || txHash

    setIsPolling(true)
    setTxStatus((prevStatus) => `${prevStatus} - Checking donation confirmation...`)

    console.log(`Polling for donation confirmation with hash: ${hashToUse}`)

    pollingIntervalRef.current = setInterval(
      async () => {
        try {
          const response = await fetch("/api/get-arbitrum-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ txHash: hashToUse }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `HTTP error ${response.status}`)
          }

          const data = await response.json()
          console.log("Polling response:", data)

          // Check if we got a non-zero amount
          if (data.success && data.parsedData && data.parsedData.amount) {
            const receivedAmount = parseInt(data.parsedData.amount)
            setReceivedDonation(receivedAmount)
            setTxStatus("Donation confirmed!")
            setIsPolling(false)

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
        } catch (error) {
          console.error("Error polling donation confirmation:", error)
          setTxStatus(`Error checking donation: ${error instanceof Error ? error.message : "Unknown error"}`)

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          setIsPolling(false)
        }
      },
      Number.parseInt(process.env.NEXT_PUBLIC_POLLING_INTERVAL || "5000"),
    )
  }

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
    setTxStatus((prevStatus) => `${prevStatus} - Polling stopped.`)
  }

  // Reset function to clear all state for a new donation
  const resetForNewDonation = () => {
    setDonationAmount("")
    setSubmittedAmount(null)
    setTxHash("")
    setTxStatus("")
    setReceivedDonation(null)
    setIsPolling(false)
    setIsLoading(false)
    setError("")

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">💝 Cross-Chain Donation Platform</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Make donations using secure cross-chain transfers from Aztec to Arbitrum
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Donation Controls */}
          <div className="space-y-6">
            {/* Donation Amount Input */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">💰 Donation Amount</h2>
              <div className="space-y-3">
                <label htmlFor="donationAmount" className="block text-sm font-medium text-gray-700">
                  How much would you like to donate?
                </label>
                <input
                  id="donationAmount"
                  type="number"
                  min="1"
                  max="254"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value ? parseInt(e.target.value) : "")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter donation amount (1-254)"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500">
                  Your donation will be securely processed via cross-chain transfer (1-254 tokens)
                </p>
                {submittedAmount === null && !donationAmount && (
                  <p className="text-xs text-red-500">
                    Donation amount is required (1-254 tokens)
                  </p>
                )}
                {submittedAmount !== null && !receivedDonation && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-xs text-blue-800 font-medium">
                      🔒 Processing donation: {submittedAmount} tokens
                    </p>
                    <p className="text-xs text-blue-600">
                      Amount is locked during transaction
                    </p>
                  </div>
                )}
                {submittedAmount !== null && receivedDonation !== null && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-xs text-green-800 font-medium">
                      ✅ Donation completed: {submittedAmount} tokens
                    </p>
                    <p className="text-xs text-green-600">
                      Cross-chain transfer confirmed successfully
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Donation Actions */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">🚀 Submit Donation</h2>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-red-600 mr-2">⚠️</span>
                    <span className="text-red-800 font-medium">{error}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={submitDonation}
                  disabled={isLoading || !donationAmount}
                >
                  {isLoading ? "🔄 Processing..." : "💝 Send Donation"}
                </button>

                {/* Reset button for new donation */}
                {(receivedDonation !== null || error) && (
                  <button
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200"
                    onClick={resetForNewDonation}
                  >
                    🔄 New Donation
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Donation Status and Results */}
          <div className="space-y-6">
            {/* Donation Status */}
            {(txStatus || txHash) && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">💝 Donation Status</h3>

                {txStatus && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center">
                      {isPolling && <span className="mr-2">🔄</span>}
                      <span className="text-purple-800 font-medium text-sm">{txStatus}</span>
                    </div>
                  </div>
                )}

                {txHash && (
                  <div className="p-3 bg-gray-50 rounded-lg mb-3">
                    <p className="font-medium text-gray-700 mb-1">Donation Receipt</p>
                    <p className="text-xs text-gray-600 font-mono break-all">{txHash}</p>
                  </div>
                )}

                {/* Polling Control Button */}
                {txHash && (
                  <button
                    className={`w-full font-semibold py-2 px-4 rounded-lg transition-all duration-200 ${
                      isPolling
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                    onClick={isPolling ? stopPolling : () => startPollingDonation(txHash)}
                  >
                    {isPolling ? "⏹️ Stop Checking" : "🔍 Check Confirmation"}
                  </button>
                )}
              </div>
            )}

            {/* Cross-Chain Donation Confirmation */}
            {receivedDonation !== null && submittedAmount !== null && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-3">🎉 Donation Confirmed!</h3>

                <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100">
                  {/* Donation Amount Verification */}
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 mb-2">Donation Verification:</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-2 rounded border border-blue-100">
                        <span className="text-xs text-blue-600 font-medium block">You Donated:</span>
                        <span className="text-lg font-bold text-blue-900">{submittedAmount}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100">
                        <span className="text-xs text-blue-600 font-medium block">Confirmed:</span>
                        <span className="text-lg font-bold text-blue-900">{receivedDonation}</span>
                      </div>
                    </div>
                    {submittedAmount === receivedDonation ? (
                      <p className="text-xs text-green-600 mt-2 text-center">✅ Donation amount verified!</p>
                    ) : (
                      <p className="text-xs text-red-600 mt-2 text-center">⚠️ Amounts don&apos;t match (Expected: {submittedAmount}, Got: {receivedDonation})</p>
                    )}
                  </div>
                  
                  {/* Success Message */}
                  <div className="mt-3 pt-3 border-t border-green-100">
                    <p className="text-sm text-green-600 text-center">
                      🌟 Thank you for your verified donation! Your contribution has been securely processed across blockchains.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}