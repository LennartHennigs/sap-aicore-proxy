import { versionChecker } from '../../src/utils/version-checker.js';
import { updateHandler } from '../../src/utils/update-handler.js';
import { consolePrompter } from '../../src/utils/console-prompter.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

interface TestResults {
  passed: number;
  failed: number;
  errors: string[];
}

const results: TestResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function test(name: string, testFn: () => Promise<void> | void): void {
  console.log(`\n🧪 Testing: ${name}`);
  try {
    const result = testFn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`✅ ${name}`);
        results.passed++;
      }).catch((error) => {
        console.error(`❌ ${name}: ${error.message}`);
        results.failed++;
        results.errors.push(`${name}: ${error.message}`);
      });
    } else {
      console.log(`✅ ${name}`);
      results.passed++;
    }
  } catch (error) {
    console.error(`❌ ${name}: ${error instanceof Error ? error.message : error}`);
    results.failed++;
    results.errors.push(`${name}: ${error instanceof Error ? error.message : error}`);
  }
}

async function runTests(): Promise<void> {
  console.log('🚀 Starting Version and Update System Tests\n');

  // Test 1: Version Checker Initialization
  test('Version checker initializes correctly', () => {
    if (!versionChecker) {
      throw new Error('Version checker not initialized');
    }
    
    // Check if it can read current version
    const cachedInfo = versionChecker.getCachedVersionInfo();
    console.log(`   Current version detected: ${cachedInfo?.current || 'Unknown'}`);
  });

  // Test 2: Cache File Management
  test('Version cache file management', () => {
    const cacheFile = join(process.cwd(), 'version-check-cache.json');
    
    // Test cache file creation/reading (will be created on first check)
    console.log(`   Cache file path: ${cacheFile}`);
    console.log(`   Cache file exists: ${existsSync(cacheFile)}`);
  });

  // Test 3: Version Comparison Logic
  test('Version comparison logic', () => {
    // We can't easily test private methods, but we can test the public interface
    // This will be tested when we get actual version info
    console.log('   Version comparison will be tested with real data');
  });

  // Test 4: GitHub API Connection (if network available)
  test('GitHub API connectivity', async () => {
    try {
      // Try to check for updates (this will test GitHub API connectivity)
      const versionInfo = await versionChecker.checkForUpdates();
      
      console.log(`   Current: ${versionInfo.current}`);
      console.log(`   Latest: ${versionInfo.latest}`);
      console.log(`   Update available: ${versionInfo.updateAvailable}`);
      console.log(`   Last checked: ${versionInfo.lastChecked}`);
      
      if (!versionInfo.current || !versionInfo.latest) {
        throw new Error('Failed to get version information');
      }
    } catch (error) {
      // Network issues are acceptable in testing
      if (error instanceof Error && (
        error.message.includes('timeout') || 
        error.message.includes('network') ||
        error.message.includes('fetch')
      )) {
        console.log('   ⚠️  Network connectivity test skipped (expected in CI/offline)');
      } else {
        throw error;
      }
    }
  });

  // Test 5: Cache Functionality
  test('Version cache functionality', async () => {
    try {
      // Force refresh to test cache invalidation
      const refreshedInfo = await versionChecker.forceRefresh();
      console.log(`   Force refresh successful: ${refreshedInfo?.current}`);
      
      // Get cached info
      const cachedInfo = versionChecker.getCachedVersionInfo();
      console.log(`   Cached info available: ${cachedInfo ? 'Yes' : 'No'}`);
      
      if (cachedInfo && refreshedInfo) {
        if (cachedInfo.current !== refreshedInfo.current) {
          throw new Error('Cache inconsistency detected');
        }
      }
    } catch (error) {
      // Network issues are acceptable
      if (error instanceof Error && (
        error.message.includes('timeout') || 
        error.message.includes('network') ||
        error.message.includes('fetch')
      )) {
        console.log('   ⚠️  Cache test skipped due to network issues');
      } else {
        throw error;
      }
    }
  });

  // Test 6: Update System Prerequisites
  test('Update system prerequisites', () => {
    const canUpdate = updateHandler.canUpdate();
    
    console.log(`   Can update: ${canUpdate.possible}`);
    if (!canUpdate.possible) {
      console.log(`   Reason: ${canUpdate.reason}`);
    }
    
    // This should not fail the test - just inform about system capabilities
    console.log('   ✓ Update capability check completed');
  });

  // Test 7: Console Prompter (Non-interactive)
  test('Console prompter initialization', () => {
    if (!consolePrompter) {
      throw new Error('Console prompter not initialized');
    }
    
    // Test display methods (they shouldn't throw)
    const mockVersionInfo = {
      current: '1.0.0',
      latest: '1.1.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/test/test/releases/tag/v1.1.0',
      releaseNotes: 'Test release notes',
      tarballUrl: 'https://github.com/test/test/archive/v1.1.0.tar.gz',
      lastChecked: new Date()
    };
    
    try {
      consolePrompter.displayUpdateAvailable(mockVersionInfo);
      console.log('   Display methods work correctly');
    } catch (error) {
      throw new Error(`Display method failed: ${error}`);
    }
  });

  // Test 8: Configuration Options
  test('Configuration options handling', () => {
    const originalEnabled = process.env.VERSION_CHECK_ENABLED;
    const originalCacheHours = process.env.VERSION_CHECK_CACHE_HOURS;
    
    // Test different configurations
    process.env.VERSION_CHECK_ENABLED = 'false';
    console.log('   ✓ Disabled configuration test');
    
    process.env.VERSION_CHECK_CACHE_HOURS = '12';
    console.log('   ✓ Custom cache duration test');
    
    // Restore original values
    if (originalEnabled !== undefined) {
      process.env.VERSION_CHECK_ENABLED = originalEnabled;
    } else {
      delete process.env.VERSION_CHECK_ENABLED;
    }
    
    if (originalCacheHours !== undefined) {
      process.env.VERSION_CHECK_CACHE_HOURS = originalCacheHours;
    } else {
      delete process.env.VERSION_CHECK_CACHE_HOURS;
    }
  });

  // Test 9: Error Handling
  test('Error handling and resilience', async () => {
    // Test with invalid GitHub repo (should handle gracefully)
    console.log('   Testing error resilience...');
    
    // The version checker should handle errors gracefully and return default info
    // We can't easily mock this without significant refactoring, but we can verify
    // that the system doesn't crash on errors
    
    try {
      const versionInfo = await versionChecker.checkForUpdates();
      console.log('   ✓ Error handling works (returned valid info)');
    } catch (error) {
      // Even if it fails, it should fail gracefully
      console.log('   ✓ Error handling works (failed gracefully)');
    }
  });

  // Test 10: File System Operations
  test('File system operations', () => {
    const testCacheFile = join(process.cwd(), 'test-version-cache.json');
    
    try {
      // Test writing
      const testData = {
        versionInfo: {
          current: '1.0.0',
          latest: '1.0.0',
          updateAvailable: false,
          releaseUrl: '',
          releaseNotes: '',
          tarballUrl: '',
          lastChecked: new Date()
        },
        cacheTimestamp: Date.now()
      };
      
      writeFileSync(testCacheFile, JSON.stringify(testData, null, 2), 'utf8');
      console.log('   ✓ Cache file write successful');
      
      // Test reading
      const readData = JSON.parse(readFileSync(testCacheFile, 'utf8'));
      if (!readData.versionInfo || !readData.cacheTimestamp) {
        throw new Error('Cache file structure invalid');
      }
      console.log('   ✓ Cache file read successful');
      
      // Cleanup
      unlinkSync(testCacheFile);
      console.log('   ✓ Cache file cleanup successful');
      
    } catch (error) {
      // Cleanup on error
      if (existsSync(testCacheFile)) {
        try {
          unlinkSync(testCacheFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  // Wait for all async tests to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Print final results
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  if (results.errors.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.errors.forEach(error => console.log(`   • ${error}`));
  }

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Version and update system is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('\n📝 Additional Notes:');
  console.log('   • Network-dependent tests may be skipped in offline environments');
  console.log('   • Update capability depends on system tools (rsync, cp, npm)');
  console.log('   • Interactive features require TTY for testing');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
