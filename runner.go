package main

import (
	"bytes"
	"context"
	"os/exec"
)

func run(ctx context.Context, input Input) (Output, error) {
	filePaths := make([]string, 0, len(input.Files))
	for _, file := range input.Files {
		filePaths = append(filePaths, file.Path)
	}

	command := runner.ToolPath
	arguments := append([]string{runner.Language}, filePaths...)

	cmd := exec.CommandContext(ctx, command, arguments...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return Output{}, err
	}

	return Output{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}, nil
} 