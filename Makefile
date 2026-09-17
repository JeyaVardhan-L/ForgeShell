CC ?= gcc
CFLAGS ?= -Wall -Wextra -Wpedantic -std=c11 -D_POSIX_C_SOURCE=200809L -D_GNU_SOURCE -Iinclude
LDFLAGS ?=

SRC_DIR = src
INC_DIR = include
BUILD_DIR = build
BIN_DIR = bin
TEST_DIR = tests
EXAMPLE_DIR = examples

SRCS = $(wildcard $(SRC_DIR)/*.c)
OBJS = $(patsubst $(SRC_DIR)/%.c, $(BUILD_DIR)/%.o, $(SRCS))
DEPS = $(OBJS:.o=.d)

TARGET = $(BIN_DIR)/forge
TEST_PARSER = $(BIN_DIR)/test_parser
EXAMPLES = $(BIN_DIR)/spin $(BIN_DIR)/leak $(BIN_DIR)/sigtrap

.PHONY: all debug asan test clean help examples

all: CFLAGS += -O2
all: $(TARGET) $(TEST_PARSER) $(EXAMPLES)

debug: CFLAGS += -g3 -O0 -DDEBUG
debug: clean all

asan: CFLAGS += -g3 -O0 -fsanitize=address,undefined -fno-omit-frame-pointer -DDEBUG
asan: LDFLAGS += -fsanitize=address,undefined
asan: clean all

$(TARGET): $(OBJS) | $(BIN_DIR)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

$(TEST_PARSER): $(BUILD_DIR)/test_parser.o $(BUILD_DIR)/parser.o $(BUILD_DIR)/common.o | $(BIN_DIR)
	$(CC) $^ -o $@ $(LDFLAGS)

$(BUILD_DIR)/test_parser.o: $(TEST_DIR)/test_parser.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(BIN_DIR)/spin: $(EXAMPLE_DIR)/spin.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $< -o $@ $(LDFLAGS)

$(BIN_DIR)/leak: $(EXAMPLE_DIR)/leak.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $< -o $@ $(LDFLAGS)

$(BIN_DIR)/sigtrap: $(EXAMPLE_DIR)/sigtrap.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $< -o $@ $(LDFLAGS)

examples: $(EXAMPLES)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -MMD -MP -c $< -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

test: all
	@echo "Running ForgeShell automated test suite..."
	@python3 tests/test_runner.py

clean:
	rm -rf $(BUILD_DIR) $(BIN_DIR) tests/temp

help:
	@echo "ForgeShell Build Targets:"
	@echo "  make        - Build forge shell, test binaries, and example workloads"
	@echo "  make debug  - Build debug binary with symbols and DEBUG macro"
	@echo "  make asan   - Build with AddressSanitizer and UndefinedBehaviorSanitizer"
	@echo "  make test   - Run automated test suite (30+ assertions)"
	@echo "  make clean  - Remove all build and test artifacts"

-include $(DEPS)
