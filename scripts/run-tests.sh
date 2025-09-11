#!/bin/bash

# SAP AI Core Proxy Test Runner
# Comprehensive test execution script with proxy management and reporting

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROXY_PORT=3001
PROXY_URL="http://localhost:$PROXY_PORT"
PROXY_PID_FILE="/tmp/sap-aicore-proxy.pid"
TEST_RESULTS_DIR="test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

# Function to show usage
show_usage() {
    echo -e "${CYAN}SAP AI Core Proxy Test Runner${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS] [TEST_CATEGORY]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -s, --start-proxy       Start proxy before running tests"
    echo "  -k, --kill-proxy        Stop proxy after running tests"
    echo "  -w, --wait-proxy        Wait for proxy to be ready"
    echo "  -r, --report            Generate detailed test report"
    echo "  -c, --continuous        Run tests continuously (watch mode)"
    echo "  -v, --verbose           Verbose output"
    echo "  --no-color              Disable colored output"
    echo "  --timeout SECONDS       Set test timeout (default: 300)"
    echo ""
    echo "Test Categories:"
    echo "  all                     Run all tests (default)"
    echo "  connection              Connection tests only"
    echo "  text                    Text processing tests only"
    echo "  image                   Image processing tests only"
    echo "  validation              Response validation tests only"
    echo "  error                   Error handling tests only"
    echo "  performance             Performance tests only"
    echo ""
    echo "Examples:"
    echo "  $0                      # Run all tests"
    echo "  $0 -s -k connection     # Start proxy, run connection tests, stop proxy"
    echo "  $0 -r performance       # Run performance tests with detailed report"
    echo "  $0 -w -v all            # Wait for proxy and run all tests with verbose output"
}

# Function to check if proxy is running
is_proxy_running() {
    if curl -s "$PROXY_URL/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start proxy
start_proxy() {
    print_status "Starting SAP AI Core proxy..."
    
    if is_proxy_running; then
        print_warning "Proxy is already running at $PROXY_URL"
        return 0
    fi
    
    # Start proxy in background
    npm run proxy > /dev/null 2>&1 &
    PROXY_PID=$!
    echo $PROXY_PID > "$PROXY_PID_FILE"
    
    print_status "Proxy started with PID $PROXY_PID"
    
    # Wait for proxy to be ready
    wait_for_proxy
}

# Function to stop proxy
stop_proxy() {
    print_status "Stopping SAP AI Core proxy..."
    
    if [ -f "$PROXY_PID_FILE" ]; then
        PROXY_PID=$(cat "$PROXY_PID_FILE")
        if kill -0 "$PROXY_PID" 2>/dev/null; then
            kill "$PROXY_PID"
            rm -f "$PROXY_PID_FILE"
            print_success "Proxy stopped (PID $PROXY_PID)"
        else
            print_warning "Proxy process not found (PID $PROXY_PID)"
            rm -f "$PROXY_PID_FILE"
        fi
    else
        # Try to stop using npm script
        npm run stop > /dev/null 2>&1 || true
        print_status "Attempted to stop proxy using npm script"
    fi
}

# Function to wait for proxy to be ready
wait_for_proxy() {
    print_status "Waiting for proxy to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if is_proxy_running; then
            print_success "Proxy is ready at $PROXY_URL"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    print_error "Proxy failed to start within $((max_attempts * 2)) seconds"
    return 1
}

# Function to run tests
run_tests() {
    local test_category="$1"
    local verbose="$2"
    local timeout="$3"
    
    print_header "🚀 Running SAP AI Core Proxy Tests"
    echo "Category: $test_category"
    echo "Timeout: ${timeout}s"
    echo "Timestamp: $(date)"
    echo ""
    
    # Set environment variables
    export PROXY_URL="$PROXY_URL"
    export API_KEY="${API_KEY:-test-key}"
    
    # Determine which test command to run
    local test_command
    case "$test_category" in
        "all")
            test_command="npm test"
            ;;
        "connection")
            test_command="npm run test:connection"
            ;;
        "text")
            test_command="npm run test:text"
            ;;
        "image")
            test_command="npm run test:image"
            ;;
        "validation")
            test_command="npm run test:validation"
            ;;
        "error")
            test_command="npm run test:error"
            ;;
        "performance")
            test_command="npm run test:performance"
            ;;
        *)
            print_error "Unknown test category: $test_category"
            return 1
            ;;
    esac
    
    # Run tests with timeout
    local start_time=$(date +%s)
    
    if [ "$verbose" = "true" ]; then
        timeout "${timeout}s" $test_command
    else
        timeout "${timeout}s" $test_command 2>&1
    fi
    
    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    print_header "📊 Test Execution Summary"
    echo "Duration: ${duration}s"
    echo "Exit Code: $exit_code"
    
    if [ $exit_code -eq 0 ]; then
        print_success "All tests completed successfully!"
    elif [ $exit_code -eq 124 ]; then
        print_error "Tests timed out after ${timeout}s"
    else
        print_error "Tests failed with exit code $exit_code"
    fi
    
    return $exit_code
}

# Function to generate test report
generate_report() {
    local test_category="$1"
    
    print_status "Generating detailed test report..."
    
    # Create results directory
    mkdir -p "$TEST_RESULTS_DIR"
    
    local report_file="$TEST_RESULTS_DIR/test-report-${test_category}-${TIMESTAMP}.txt"
    
    # Run tests and capture output
    {
        echo "SAP AI Core Proxy Test Report"
        echo "============================="
        echo "Generated: $(date)"
        echo "Category: $test_category"
        echo "Proxy URL: $PROXY_URL"
        echo ""
        
        run_tests "$test_category" "true" "300"
        
    } > "$report_file" 2>&1
    
    print_success "Test report saved to: $report_file"
    
    # Show summary
    if grep -q "TEST SUITE PASSED" "$report_file"; then
        print_success "Overall result: PASSED"
    elif grep -q "TEST SUITE PARTIAL" "$report_file"; then
        print_warning "Overall result: PARTIAL"
    else
        print_error "Overall result: FAILED"
    fi
}

# Function to run continuous tests
run_continuous() {
    local test_category="$1"
    
    print_header "🔄 Continuous Test Mode"
    print_status "Running tests continuously. Press Ctrl+C to stop."
    
    local iteration=1
    
    while true; do
        print_header "Iteration $iteration - $(date)"
        
        if run_tests "$test_category" "false" "300"; then
            print_success "Iteration $iteration: PASSED"
        else
            print_error "Iteration $iteration: FAILED"
        fi
        
        echo ""
        print_status "Waiting 30 seconds before next iteration..."
        sleep 30
        
        iteration=$((iteration + 1))
    done
}

# Function to check prerequisites
check_prerequisites() {
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed or not in PATH"
        return 1
    fi
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed or not in PATH"
        return 1
    fi
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run from project root directory."
        return 1
    fi
    
    # Check if test files exist
    if [ ! -d "tests" ]; then
        print_error "tests directory not found"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    local start_proxy_flag=false
    local stop_proxy_flag=false
    local wait_proxy_flag=false
    local generate_report_flag=false
    local continuous_flag=false
    local verbose_flag=false
    local test_category="all"
    local timeout=300
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -s|--start-proxy)
                start_proxy_flag=true
                shift
                ;;
            -k|--kill-proxy)
                stop_proxy_flag=true
                shift
                ;;
            -w|--wait-proxy)
                wait_proxy_flag=true
                shift
                ;;
            -r|--report)
                generate_report_flag=true
                shift
                ;;
            -c|--continuous)
                continuous_flag=true
                shift
                ;;
            -v|--verbose)
                verbose_flag=true
                shift
                ;;
            --no-color)
                # Disable colors
                RED=''
                GREEN=''
                YELLOW=''
                BLUE=''
                PURPLE=''
                CYAN=''
                NC=''
                shift
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            all|connection|text|image|validation|error|performance)
                test_category="$1"
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi
    
    # Handle proxy management
    if [ "$start_proxy_flag" = true ]; then
        start_proxy
    elif [ "$wait_proxy_flag" = true ]; then
        if ! is_proxy_running; then
            print_error "Proxy is not running. Use -s to start it."
            exit 1
        fi
        wait_for_proxy
    fi
    
    # Trap to ensure cleanup
    if [ "$stop_proxy_flag" = true ]; then
        trap 'stop_proxy' EXIT
    fi
    
    # Execute tests based on mode
    local exit_code=0
    
    if [ "$generate_report_flag" = true ]; then
        generate_report "$test_category"
        exit_code=$?
    elif [ "$continuous_flag" = true ]; then
        run_continuous "$test_category"
        exit_code=$?
    else
        run_tests "$test_category" "$verbose_flag" "$timeout"
        exit_code=$?
    fi
    
    # Stop proxy if requested
    if [ "$stop_proxy_flag" = true ]; then
        stop_proxy
    fi
    
    exit $exit_code
}

# Run main function with all arguments
main "$@"
