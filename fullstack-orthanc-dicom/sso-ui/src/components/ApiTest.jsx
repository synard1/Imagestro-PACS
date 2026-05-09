import React, { useState } from 'react'
import { systemAPI } from '../services/api'

function ApiTest() {
  const [testResults, setTestResults] = useState({})
  const [testing, setTesting] = useState(false)

  const testEndpoints = async () => {
    setTesting(true)
    const results = {}

    if (process.env.NODE_ENV === 'development') {
      console.log('Starting API endpoint tests...')
    }

    // Test system statistics
    try {
      const statsResponse = await systemAPI.getStatistics()
      results.statistics = {
        status: 'success',
        data: statsResponse,
        message: 'Statistics API working'
      }
    } catch (error) {
      results.statistics = {
        status: 'error',
        error: error.message,
        message: 'Statistics API failed'
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Statistics API test failed:', error)
      }
    }

    // Test health check
    try {
      const healthResponse = await systemAPI.healthCheck()
      results.healthCheck = {
        status: 'success',
        data: healthResponse,
        message: 'Health check API working'
      }
    } catch (error) {
      results.healthCheck = {
        status: 'error',
        error: error.message,
        message: 'Health check API failed'
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Health check API test failed:', error)
      }
    }

    // Test audit logs
    try {
      const auditResponse = await systemAPI.getAuditLogs({ limit: 5 })
      results.auditLogs = {
        status: 'success',
        data: auditResponse,
        message: 'Audit logs API working'
      }
    } catch (error) {
      results.auditLogs = {
        status: 'error',
        error: error.message,
        message: 'Audit logs API failed'
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Audit logs API test failed:', error)
      }
    }

    setTestResults(results)
    setTesting(false)
    if (process.env.NODE_ENV === 'development') {
      console.log('API endpoint tests completed:', results)
    }
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        API Endpoint Tests
      </h2>
      
      <button
        onClick={testEndpoints}
        disabled={testing}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {testing ? 'Testing...' : 'Run API Tests'}
      </button>

      {Object.keys(testResults).length > 0 && (
        <div className="space-y-4">
          {Object.entries(testResults).map(([endpoint, result]) => (
            <div key={endpoint} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {endpoint}
                </h3>
                <span className={`px-2 py-1 rounded text-sm ${
                  result.status === 'success' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {result.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {result.message}
              </p>
              {result.error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Error: {result.error}
                </p>
              )}
              {result.data && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                    View Response Data
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ApiTest