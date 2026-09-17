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

.PHONY: all debug asan test clean help

all: CFLAGS += -O2
all: $(TARGET)

debug: CFLAGS += -g3 -O0 -DDEBUG
debug: clean $(TARGET)

asan: CFLAGS += -g3 -O0 -fsanitize=address,undefined -fno-omit-frame-pointer -DDEBUG
asan: LDFLAGS += -fsanitize=address,undefined
asan: clean $(TARGET)

$(TARGET): $(OBJS) | $(BIN_DIR)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

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
	@echo "  make        - Build optimized release binary ($(TARGET))"
	@echo "  make debug  - Build debug binary with symbols and DEBUG macro"
	@echo "  make asan   - Build with AddressSanitizer and UndefinedBehaviorSanitizer"
	@echo "  make test   - Run automated test suite"
	@echo "  make clean  - Remove all build and test artifacts"

-include $(DEPS)
