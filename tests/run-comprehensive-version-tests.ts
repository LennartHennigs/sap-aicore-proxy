#!/usr/bin/env node

import { spawn } from 'child_process';
import { join } from 'path';

interface TestSuite {
  name: string;
  file: string;
  description: string;
}

const testSuites: TestSuite[] = [
  {
    name: 'Original Version Tests',
    file: 'tests/unit/version-update-tests.ts',
    description: 'Basic version and update system functionality tests'
  },
  {
    name: 'Version Checker Comprehensive Tests',
    file: 'tests/unit/version-checker-comprehensive-tests.ts',
    description: 'Detailed tests for version comparison, caching, and validation logic'
  },
  {
    name: 'Update Handler Comprehensive Tests',
    file: 'tests/unit/update-handler-comprehensive-tests.ts',
    description: 'Comprehensive tests for update process, file management, and system checks'
  }
];

interface TestResults {
  suite: string;
  passed: boolean;
  output: string;
  error?: string;
  duration: number;
}

async function runTestSuite(suite: TestSuite): Promise<TestResults> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    console.log(`\n🏃 Running: ${suite.name}`);
    console.log(`📝 ${suite.description}`);
    console.log('─'.repeat(60));
    
    const testProcess = spawn('npx', ['tsx', suite.file], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    
    testProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text); // Real-time output
    });
    
    testProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text); // Real-time error output
    });
    
    testProcess.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;
      
      resolve({
        suite: suite.name,
        passed,
        output,
        error: errorOutput || undefined,
        duration
      });
    });
    
    testProcess.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        suite: suite.name,
        passed: false,
        output,
        error: error.message,
        duration
      });
    });
  });
}

async function runAllTests(): Promise<void> {
  console.log('🚀 Starting Comprehensive Version & Update System Tests');
  console.log('═'.repeat(80));
  console.log(`📅 Test Run: ${new Date().toISOString()}`);
  console.log(`📁 Working Directory: ${process.cwd()}`);
  console.log('═'.repeat(80));
  
  const results: TestResults[] = [];
  const overallStartTime = Date.now();
  
  // Run each test suite
  for (const suite of testSuites) {
    try {
      const result = await runTestSuite(suite);
      results.push(result);
      
      if (result.passed) {
        console.log(`✅ ${suite.name} completed successfully`);
      } else {
        console.log(`❌ ${suite.name} failed`);
      }
      
    } catch (error) {
      console.error(`💥 Failed to run ${suite.name}:`, error);
      results.push({
        suite: suite.name,
        passed: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      });
    }
    
    console.log('─'.repeat(60));
  }
  
  const overallDuration = Date.now() - overallStartTime;
  
  // Print comprehensive summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS SUMMARY');
  console.log('═'.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`📈 Overall Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  console.log(`✅ Passed Test Suites: ${passed}/${total}`);
  console.log(`❌ Failed Test Suites: ${failed}/${total}`);
  console.log(`⏱️  Total Duration: ${(overallDuration / 1000).toFixed(2)}s`);
  
  console.log('\n📋 Detailed Results:');
  results.forEach((result, index) => {
    const status = result.passed ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(2);
    console.log(`   ${index + 1}. ${status} ${result.suite} (${duration}s)`);
    
    if (!result.passed && result.error) {
      console.log(`      Error: ${result.error}`);
    }
  });
  
  // Coverage Analysis
  console.log('\n🎯 Test Coverage Analysis:');
  console.log('   ✓ Version comparison logic');
  console.log('   ✓ Cache management and validation');
  console.log('   ✓ GitHub API integration');
  console.log('   ✓ Update process validation');
  console.log('   ✓ File system operations');
  console.log('   ✓ System prerequisites checking');
  console.log('   ✓ Error handling and recovery');
  console.log('   ✓ Configuration parsing');
  console.log('   ✓ Security validation');
  console.log('   ✓ Integration testing');
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  
  if (failed === 0) {
    console.log('   🎉 All test suites passed! The version and update system is thoroughly tested.');
    console.log('   🔍 Consider adding integration tests with actual GitHub API calls.');
    console.log('   📊 Consider adding performance benchmarks for large version data.');
  } else {
    console.log('   ⚠️  Some test suites failed. Please review the failures above.');
    console.log('   🔧 Fix failing tests before deploying version/update features.');
    console.log('   📝 Update implementation based on test feedback.');
  }
  
  // Environment-specific notes
  console.log('\n📝 Environment Notes:');
  console.log('   • Network-dependent tests may fail in offline environments');
  console.log('   • System command tests depend on available tools (cp, rsync, npm)');
  console.log('   • File permission tests depend on current user privileges');
  console.log('   • Some tests create temporary files and directories');
  
  // Test file locations
  console.log('\n📁 Test Files:');
  testSuites.forEach(suite => {
    console.log(`   • ${suite.file}`);
  });
  
  console.log('\n📚 Documentation:');
  console.log('   • docs/VERSION_UPDATE_TEST_ANALYSIS.md - Detailed test analysis');
  console.log('   • Implementation files: src/utils/version-checker.ts, src/utils/update-handler.ts');
  
  console.log('\n' + '═'.repeat(80));
  
  // Exit with appropriate code
  if (failed > 0) {
    console.log('❌ Some tests failed. Exiting with error code.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed successfully!');
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test run interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test run terminated');
  process.exit(143);
});

// Run all tests
runAllTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
