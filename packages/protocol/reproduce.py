import re


def convert_to_solidity(call_sequence):
    # Regex patterns to extract the necessary parts
    call_pattern = re.compile(
        r"(?:Fuzz\.)?(\w+\([^\)]*\))(?: from: (0x[0-9a-fA-F]{40}))?(?: Gas: (\d+))?(?: Time delay: (\d+) seconds)?(?: Block delay: (\d+))?"
    )
    wait_pattern = re.compile(
        r"\*wait\*(?: Time delay: (\d+) seconds)?(?: Block delay: (\d+))?"
    )

    solidity_code = "function test_replay() public {\n"

    lines = call_sequence.strip().split("\n")
    last_index = len(lines) - 1

    for i, line in enumerate(lines):
        call_match = call_pattern.search(line)
        wait_match = wait_pattern.search(line)
        if call_match:
            call, from_addr, gas, time_delay, block_delay = call_match.groups()

            # Add prank line if from address exists
            # if from_addr:
            #     solidity_code += f'    vm.prank({from_addr});\n'

            # Add warp line if time delay exists
            if time_delay:
                solidity_code += f"    vm.warp(block.timestamp + {time_delay});\n"

            # Add roll line if block delay exists
            if block_delay:
                solidity_code += f"    vm.roll(block.number + {block_delay});\n"

            if "collateralToMarketId" in call:
                continue

            # Add function call
            if i < last_index:
                solidity_code += f"    try this.{call} {{}} catch {{}}\n"
            else:
                solidity_code += f"    {call};\n"
            solidity_code += "\n"
        elif wait_match:
            time_delay, block_delay = wait_match.groups()

            # Add warp line if time delay exists
            if time_delay:
                solidity_code += f"    vm.warp(block.timestamp + {time_delay});\n"

            # Add roll line if block delay exists
            if block_delay:
                solidity_code += f"    vm.roll(block.number + {block_delay});\n"
            solidity_code += "\n"

    solidity_code += "}\n"

    return solidity_code


# Example usage
call_sequence = """
     *wait* Time delay: 408350 seconds Block delay: 82678
    Fuzz.excludeContracts() from: 0x0000000000000000000000000000000000020000 Time delay: 33605 seconds Block delay: 12053
    Fuzz.fuzz_initializeMarket(7032324,4370001) from: 0x0000000000000000000000000000000000010000 Time delay: 569114 seconds Block delay: 30011
    *wait* Time delay: 401699 seconds Block delay: 19933
    Fuzz.IS_TEST() from: 0x0000000000000000000000000000000000020000 Time delay: 263221 seconds Block delay: 23978
    *wait* Time delay: 195123 seconds Block delay: 1984
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000020000 Time delay: 82672 seconds Block delay: 19933
    Fuzz.failed() from: 0x0000000000000000000000000000000000030000 Time delay: 358628 seconds Block delay: 30304
    Fuzz.excludeContracts() from: 0x0000000000000000000000000000000000030000 Time delay: 289103 seconds Block delay: 127
    *wait* Time delay: 1182956 seconds Block delay: 132968
    Fuzz.IS_TEST() from: 0x0000000000000000000000000000000000030000 Time delay: 439556 seconds Block delay: 35200
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000020000 Time delay: 73040 seconds Block delay: 1088
    *wait* Time delay: 150273 seconds Block delay: 1123
    Fuzz.fuzz_updateMarket(4370001,406) from: 0x0000000000000000000000000000000000020000 Time delay: 305359 seconds Block delay: 1362
    *wait* Time delay: 414579 seconds Block delay: 22699
    Fuzz.fuzz_closeAllLiquidityPositions() from: 0x0000000000000000000000000000000000030000 Time delay: 440097 seconds Block delay: 5140
    Fuzz.excludeContracts() from: 0x0000000000000000000000000000000000030000 Time delay: 49735 seconds Block delay: 12338
    Fuzz.excludeContracts() from: 0x0000000000000000000000000000000000020000 Time delay: 440097 seconds Block delay: 12155
    Fuzz.targetSelectors() from: 0x0000000000000000000000000000000000030000 Time delay: 136394 seconds Block delay: 32767
    Fuzz.IS_TEST() from: 0x0000000000000000000000000000000000020000 Time delay: 404997 seconds Block delay: 16089
    Fuzz.excludeSenders() from: 0x0000000000000000000000000000000000010000 Time delay: 390247 seconds Block delay: 60054
    Fuzz.targetSenders() from: 0x0000000000000000000000000000000000010000 Time delay: 447588 seconds Block delay: 59552
    *wait* Time delay: 511822 seconds Block delay: 11942
    Fuzz.fuzz_updateMarket(5435502,2284164) from: 0x0000000000000000000000000000000000030000 Time delay: 225906 seconds Block delay: 57086
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000010000 Time delay: 117472 seconds Block delay: 19933
    Fuzz.excludeSenders() from: 0x0000000000000000000000000000000000020000 Time delay: 322247 seconds Block delay: 30256
    *wait* Time delay: 377553 seconds Block delay: 113291
    Fuzz.targetInterfaces() from: 0x0000000000000000000000000000000000030000 Time delay: 100835 seconds Block delay: 3661
    *wait* Time delay: 455880 seconds Block delay: 96709
    Fuzz.excludeSenders() from: 0x0000000000000000000000000000000000020000 Time delay: 127251 seconds Block delay: 23403
    Fuzz.excludeSenders() from: 0x0000000000000000000000000000000000020000 Time delay: 225906 seconds Block delay: 800
    *wait* Time delay: 166426 seconds Block delay: 30127
    Fuzz.fuzz_updateMarket(99608,406) from: 0x0000000000000000000000000000000000020000 Time delay: 185616 seconds Block delay: 23403
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000020000 Time delay: 407328 seconds Block delay: 54155
    Fuzz.fuzz_createEpoch(744302671765418271359737856802720853139846985685) from: 0x0000000000000000000000000000000000030000 Time delay: 156190 seconds Block delay: 9920
    Fuzz.targetArtifacts() from: 0x0000000000000000000000000000000000030000 Time delay: 512439 seconds Block delay: 11905
    *wait* Time delay: 136393 seconds Block delay: 45261
    Fuzz.IS_TEST() from: 0x0000000000000000000000000000000000030000 Time delay: 376096 seconds Block delay: 11349
    Fuzz.fuzz_createLiquidityPosition(63233223720021112819282167419737110798583696132242805953878303893237607928825,4370000,5537568) from: 0x0000000000000000000000000000000000030000 Time delay: 65535 seconds Block delay: 23885
    *wait* Time delay: 1035806 seconds Block delay: 107358
    Fuzz.fuzz_createTraderPositionShort(74168030851680070346907312875863904309627912880834115521080344961590547679238,274) from: 0x0000000000000000000000000000000000020000 Time delay: 100835 seconds Block delay: 4462
    *wait* Time delay: 585867 seconds Block delay: 67591
    Fuzz.fuzz_createTraderPositionShort(789,6504373994140078) from: 0x0000000000000000000000000000000000010000 Time delay: 4378 seconds Block delay: 49415
    Fuzz.targetInterfaces() from: 0x0000000000000000000000000000000000010000 Time delay: 195123 seconds Block delay: 12155
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000020000 Time delay: 234111 seconds Block delay: 30042
    Fuzz.targetArtifactSelectors() from: 0x0000000000000000000000000000000000030000 Time delay: 136392 seconds Block delay: 27404
    Fuzz.fuzz_modifyTraderPositionLong(4370000,0) from: 0x0000000000000000000000000000000000020000 Time delay: 50417 seconds Block delay: 5952
    *wait* Time delay: 32767 seconds Block delay: 59552
    Fuzz.excludeContracts() from: 0x0000000000000000000000000000000000010000 Time delay: 16802 seconds Block delay: 2511
    *wait* Time delay: 241891 seconds Block delay: 3661
    Fuzz.fuzz_closeLiquidityPosition(115792089237316195423570985008687907853269984665640564039457584007913129639932) from: 0x0000000000000000000000000000000000030000 Time delay: 420078 seconds Block delay: 53678
    Fuzz.fuzz_decreaseLiquidityPosition(115792089237316195423570985008687907853269984665640564039457584007913129639935) from: 0x0000000000000000000000000000000000030000 Time delay: 289103 seconds Block delay: 54155


"""

solidity_code = convert_to_solidity(call_sequence)
print(solidity_code)
